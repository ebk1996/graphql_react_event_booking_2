const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Event = require('../../models/event');
const User = require('../../models/user');
const Booking = require('../../models/booking');
const Driver = require('../../models/driver');
const Ride = require('../../models/ride');
const Notification = require('../../models/notification');
const { isValidObjectId, ensureValidObjectId, ensureOwner } = require('./helpers');
const { createTransformEvent } = require('./transform');
const { jwtSecret, TOKEN_EXPIRATION_HOURS } = require('../../config/auth');
const social = require('./social');
const { Comment, Message } = require('../models/Social');
const AppNotification = require('../models/AppNotification');
const { calculateFare } = require('../services/fare');
const {
    routeBetween,
    reverseGeocode,
    resolveLocation,
    isValidCoord,
} = require('../services/routing');
const Card = require('../models/Card');
const Payment = require('../models/Payment');
const {
    stripePublishableKey,
    createAndConfirmPaymentIntent,
    chargeRideOnComplete,
    retrievePaymentIntent,
    capturePaymentIntent,
    assertIntentUsable,
    mapPaymentStatus,
    attachPaymentMethod,
} = require('../services/stripe');

// transformEvent created after user resolver is defined; placeholder will be reassigned
let transformEvent;

// Shared helpers
const findEventOrThrow = async (eventId) => {
    ensureValidObjectId(eventId, 'Event not found');
    const found = await Event.findById(eventId);
    if (!found) {
        throw new Error('Event not found');
    }
    return found;
};
const findBookingOrThrow = async (bookingId) => {
    ensureValidObjectId(bookingId, 'Booking not found');
    const found = await Booking.findById(bookingId).populate('event');
    if (!found) {
        throw new Error('Booking not found');
    }
    return found;
};
const findUserOrThrow = async (userId, message = 'Please log in to continue.') => {
    ensureValidObjectId(userId, message);
    const found = await User.findById(userId);
    if (!found) {
        throw new Error(message);
    }
    return found;
};
// Identity comes from the verified JWT in the request context — never from arguments,
// which a client can set to anything.
const requireAuth = (context, message = 'Please log in to continue.') => {
    if (!context || !context.isAuth) {
        throw new Error(message);
    }
    return findUserOrThrow(context.userId, message);
};

const event = async (eventIds) => {
    try {
        const events = await Event.find({ _id: { $in: eventIds } });
        return events.map((event) => {
            return transformEvent(event);
        });
    } catch (err) {
        throw err;
    }
};
const singleEvent = async (eventId) => {
    try {
        const found = await findEventOrThrow(eventId);
        return transformEvent(found);
    } catch (err) {
        if (err && /Cast to ObjectId failed/.test(err.message)) {
            throw new Error('Event not found');
        }
        throw err;
    }
};
const user = async (userId) => {
    try {
        const foundUser = await User.findById(userId);
        return {
            ...foundUser._doc,
            _id: foundUser.id,
            createdEvents: event.bind(this, foundUser._doc.createdEvents),
        };
    } catch (err) {
        throw err;
    }
};
// Initialize transformEvent now that user is defined
transformEvent = createTransformEvent(user);

const transformBooking = (booking) => ({
    ...booking._doc,
    _id: booking.id,
    user: user.bind(this, booking._doc.user),
    event: singleEvent.bind(this, booking._doc.event),
    createdAt: new Date(booking._doc.createdAt).toISOString(),
    updatedAt: new Date(booking._doc.updatedAt).toISOString(),
});


// ============================================================
// ADMIN / DRIVER AUTHORIZATION
// ============================================================

const ADMIN_EMAIL = 'echolsbrysonkyle@gmail.com';

const isAdminUser = (u) =>
    !!u &&
    String(u.email || '').trim().toLowerCase() === ADMIN_EMAIL;

const requireAdmin = async (context) => {
    const u = await requireAuth(context, 'Administrator login required.');
    if (!isAdminUser(u)) {
        throw new Error('Administrator access denied.');
    }

    if (u.role !== 'admin') {
        u.role = 'admin';
        await u.save();
    }

    return u;
};

const getApprovedDriver = async (context) => {
    const u = await requireAuth(context, 'Please log in as a driver.');

    const d = await Driver.findOne({ user: u._id });

    if (!d) {
        throw new Error('Driver profile not found.');
    }

    if (d.status !== 'APPROVED') {
        throw new Error('Only approved drivers can perform this action.');
    }

    if (d.vehicleStatus !== 'APPROVED') {
        throw new Error('Vehicle has not been approved.');
    }

    return d;
};

const transformDriver = async (d) => {
    if (!d) return null;

    let u = null;

    if (d.user) {
        u = await User.findById(d.user);
    }

    return {
        ...d._doc,
        _id: d.id,
        user: u
            ? {
                ...u._doc,
                _id: u.id,
                password: undefined,
            }
            : null,
        createdAt: d.createdAt
            ? new Date(d.createdAt).toISOString()
            : null,
        updatedAt: d.updatedAt
            ? new Date(d.updatedAt).toISOString()
            : null,
    };
};

const transformRide = async (r) => {
    if (!r) return null;

    const rider = r.rider
        ? await User.findById(r.rider)
        : null;

    const driver = r.driver
        ? await Driver.findById(r.driver)
        : null;

    const pickupAddress =
        r.pickup && typeof r.pickup === 'object'
            ? String(r.pickup.address || '')
            : String(r.pickup || '');

    const destinationAddress =
        r.destination && typeof r.destination === 'object'
            ? String(r.destination.address || '')
            : String(r.destination || '');

    return {
        ...r._doc,
        _id: r.id,
        pickup: pickupAddress,
        destination: destinationAddress,
        fare: r.fare ?? r.estimatedFare ?? 0,
        estimatedFare: r.estimatedFare ?? r.fare ?? 0,
        rider: rider
            ? {
                ...rider._doc,
                _id: rider.id,
                password: undefined,
            }
            : null,
        driver: driver ? await transformDriver(driver) : null,
        createdAt: r.createdAt
            ? new Date(r.createdAt).toISOString()
            : null,
        updatedAt: r.updatedAt
            ? new Date(r.updatedAt).toISOString()
            : null,
    };
};


module.exports = {
    stripeConfig: async () => ({
        publishableKey: stripePublishableKey(),
        configured: Boolean(stripePublishableKey()),
    }),


    me: async (_args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to continue.'
        );

        return social.userObject(currentUser);
    },

    user: async (args) => {
        const foundUser = await User.findById(args.userId);

        if (!foundUser) {
            throw new Error('User not found.');
        }

        return social.userObject(foundUser);
    },

    profile: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to view your profile.'
        );

        if (String(args.userId) !== String(currentUser._id)) {
            throw new Error('You can only view your own profile.');
        }

        return social.userObject(currentUser);
    },

    users: async () => {
        const users = await User.find({})
            .select('-password')
            .sort({ createdAt: -1 });

        return users.map(social.userObject);
    },

    comments: async (args) => {
        return social.createCommentQuery(args);
    },

    messages: async (args, context) => {
        return social.messagesQuery(args, context);
    },

    unreadMessageCount: async (args, context) => {
        return social.unreadMessageCount(args, context);
    },

    appNotifications: async (_args, context) => {
        const user = await requireAuth(
            context,
            'Please log in to see notifications.'
        );

        const notifications = await AppNotification.find({
            recipient: user._id,
        })
            .populate('sender')
            .sort({ createdAt: -1 });

        return notifications.map(notification => ({
            ...notification._doc,
            _id: notification.id,
            sender: notification.sender
                ? social.userObject(notification.sender)
                : null,
            createdAt: new Date(notification.createdAt).toISOString(),
        }));
    },


    myDriver: async (_args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to view your driver profile.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            return null;
        }

        return {
            ...driver._doc,
            _id: driver.id,
            user: social.userObject(currentUser),
            currentLocation: driver.currentLocation
                ? {
                    lat: driver.currentLocation.lat,
                    lng: driver.currentLocation.lng,
                }
                : null,
        };
    },

    applyAsDriver: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to apply as a driver.'
        );

        const existingDriver = await Driver.findOne({
            user: currentUser._id,
        });

        if (existingDriver) {
            throw new Error('Driver application already exists.');
        }

        const input = args.driverInput;

        const vehicleYear = Number(input.vehicleYear);

        if (!Number.isInteger(vehicleYear) || vehicleYear < 1900 || vehicleYear > 2100) {
            throw new Error('Invalid vehicle year.');
        }

        const driver = new Driver({
            user: currentUser._id,
            status: 'PENDING',
            online: false,
            vehicleMake: String(input.vehicleMake).trim(),
            vehicleModel: String(input.vehicleModel).trim(),
            vehicleYear,
            vehicleColor: String(input.vehicleColor).trim(),
            licensePlate: String(input.licensePlate).trim().toUpperCase(),
        });

        const saved = await driver.save();

        return {
            ...saved._doc,
            _id: saved.id,
            user: social.userObject(currentUser),
            currentLocation: null,
        };
    },

    updateDriver: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to update your driver profile.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            throw new Error('Driver profile not found.');
        }

        const input = args.driverInput;
        const vehicleYear = Number(input.vehicleYear);

        if (!Number.isInteger(vehicleYear) || vehicleYear < 1900 || vehicleYear > 2100) {
            throw new Error('Invalid vehicle year.');
        }

        driver.vehicleMake = String(input.vehicleMake).trim();
        driver.vehicleModel = String(input.vehicleModel).trim();
        driver.vehicleYear = vehicleYear;
        driver.vehicleColor = String(input.vehicleColor).trim();
        driver.licensePlate = String(input.licensePlate)
            .trim()
            .toUpperCase();

        const saved = await driver.save();

        return {
            ...saved._doc,
            _id: saved.id,
            user: social.userObject(currentUser),
        };
    },

    setDriverOnline: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to change driver status.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            throw new Error('Driver profile not found.');
        }

        if (driver.status !== 'APPROVED') {
            throw new Error(
                'Only approved drivers can go online.'
            );
        }

        driver.online = Boolean(args.online);

        const saved = await driver.save();

        return {
            ...saved._doc,
            _id: saved.id,
            user: social.userObject(currentUser),
        };
    },

    updateDriverLocation: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to update your driver location.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            throw new Error('Driver profile not found.');
        }

        if (driver.status !== 'APPROVED') {
            throw new Error(
                'Only approved drivers can update their location.'
            );
        }

        const lat = Number(args.lat);
        const lng = Number(args.lng);

        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            throw new Error('Invalid latitude.');
        }

        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
            throw new Error('Invalid longitude.');
        }

        driver.currentLocation = {
            lat,
            lng,
        };

        const saved = await driver.save();

        return {
            ...saved._doc,
            _id: saved.id,
            user: social.userObject(currentUser),
        };
    },

    savePaymentMethod: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to save a payment method.'
        );

        const paymentMethodId = String(
            args.paymentMethodId || ''
        ).trim();

        if (!paymentMethodId) {
            throw new Error('A Stripe payment method is required.');
        }

        const { customer, paymentMethod } =
            await require('../services/stripe').attachPaymentMethod(
                currentUser,
                paymentMethodId
            );

        const card = paymentMethod.card;

        if (!card) {
            throw new Error('The Stripe payment method is not a card.');
        }

        const existing = await Card.findOne({
            user: currentUser._id,
            provider: 'stripe',
            providerPaymentMethodId: paymentMethod.id,
        });

        if (existing) {
            existing.providerCustomerId = customer.id;
            existing.brand = card.brand || '';
            existing.last4 = card.last4 || '';
            existing.expirationMonth = card.exp_month || null;
            existing.expirationYear = card.exp_year || null;

            const saved = await existing.save();

            return {
                ...saved._doc,
                _id: saved.id,
                expMonth: saved.expirationMonth,
                expYear: saved.expirationYear,
                defaultCard: saved.isDefault,
            };
        }

        const hasDefault = await Card.exists({
            user: currentUser._id,
            isDefault: true,
        });

        const saved = await new Card({
            user: currentUser._id,
            provider: 'stripe',
            providerCustomerId: customer.id,
            providerPaymentMethodId: paymentMethod.id,
            brand: card.brand || '',
            last4: card.last4 || '',
            expirationMonth: card.exp_month || null,
            expirationYear: card.exp_year || null,
            isDefault: !hasDefault,
        }).save();

        return {
            ...saved._doc,
            _id: saved.id,
            expMonth: saved.expirationMonth,
            expYear: saved.expirationYear,
            defaultCard: saved.isDefault,
        };
    },

    createRidePaymentIntent: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to create a payment.'
        );

        const distanceMiles = Number(
            args.distanceMiles ??
            0
        );

        const durationMinutes = Number(
            args.durationMinutes ??
            0
        );

        const surgeMultiplier = Number(args.surgeMultiplier || 1);

        if (!Number.isFinite(distanceMiles) || distanceMiles < 0) {
            throw new Error('Invalid distance.');
        }

        if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
            throw new Error('Invalid duration.');
        }

        if (!Number.isFinite(surgeMultiplier) || surgeMultiplier < 1) {
            throw new Error('Invalid surge multiplier.');
        }

        const fare = calculateFare({
            distanceMiles,
            durationMinutes,
            surgeMultiplier,
        });

        const paymentIntent = await createAndConfirmPaymentIntent({
            user: currentUser,
            amount: fare.estimatedFare,
            paymentMethodId: args.paymentMethodId,
            metadata: {
                type: 'ride',
                distanceMiles: String(fare.distanceMiles),
                durationMinutes: String(fare.durationMinutes),
            },
        });

        const stripeStatus = mapPaymentStatus(paymentIntent.status);

        return {
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret || '',
            status: stripeStatus,
            amount: fare.estimatedFare,
            paymentStatus: stripeStatus,
        };
    },

    requestRide: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to request a ride.'
        );

        const distanceMiles = Number(args.distanceMiles);
        const durationMinutes = Number(args.durationMinutes);
        const surgeMultiplier = Number(args.surgeMultiplier || 1);

        if (!Number.isFinite(distanceMiles) || distanceMiles < 0) {
            throw new Error('Invalid distance.');
        }

        if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
            throw new Error('Invalid duration.');
        }

        if (!Number.isFinite(surgeMultiplier) || surgeMultiplier < 1) {
            throw new Error('Invalid surge multiplier.');
        }

        const paymentMethodId = String(args.paymentMethodId || '').trim();
        const paymentIntentId = String(args.paymentIntentId || '').trim();

        if (!paymentMethodId && !paymentIntentId) {
            throw new Error('A saved payment card is required.');
        }

        let pickupLat = Number(args.pickup && args.pickup.lat);
        let pickupLng = Number(args.pickup && args.pickup.lng);
        let destLat = Number(args.destination && args.destination.lat);
        let destLng = Number(args.destination && args.destination.lng);

        let pickupAddress = String((args.pickup && args.pickup.address) || '').trim();
        let destinationAddress = String(
            (args.destination && args.destination.address) || ''
        ).trim();

        if (
            isValidCoord(pickupLat, pickupLng) &&
            isValidCoord(destLat, destLng)
        ) {
            const [pickupResolved, destResolved, route] = await Promise.all([
                resolveLocation(args.pickup),
                resolveLocation(args.destination),
                routeBetween(args.pickup, args.destination),
            ]);
            pickupAddress = pickupResolved.address;
            destinationAddress = destResolved.address;
            pickupLat = pickupResolved.lat;
            pickupLng = pickupResolved.lng;
            destLat = destResolved.lat;
            destLng = destResolved.lng;
            args.distanceMiles = route.distanceMiles;
            args.durationMinutes = route.durationMinutes;
        }

        if (!pickupAddress || !destinationAddress) {
            throw new Error('Pickup and destination must be selected on the map.');
        }

        const fare = calculateFare({
            distanceMiles: Number(args.distanceMiles),
            durationMinutes: Number(args.durationMinutes),
            surgeMultiplier,
        });

        let paymentStatus = 'PENDING';
        let stripePaymentStatus = '';
        let storedPaymentIntentId = '';

        if (paymentMethodId) {
            await attachPaymentMethod(currentUser, paymentMethodId);
        } else if (paymentIntentId) {
            const paymentIntent = await retrievePaymentIntent(paymentIntentId);
            assertIntentUsable(
                paymentIntent,
                currentUser,
                fare.estimatedFare
            );
            paymentStatus = mapPaymentStatus(paymentIntent.status);
            stripePaymentStatus = paymentIntent.status;
            storedPaymentIntentId = paymentIntent.id;
        }

        const ride = new Ride({
            rider: currentUser._id,
            driver: null,

            pickup: pickupAddress,
            destination: destinationAddress,
            pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
            pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
            destinationLat: Number.isFinite(destLat) ? destLat : null,
            destinationLng: Number.isFinite(destLng) ? destLng : null,

            distanceMiles: fare.distanceMiles,
            durationMinutes: fare.durationMinutes,

            fare: fare.estimatedFare,
            estimatedFare: fare.estimatedFare,

            driverAmount: fare.driverAmount,
            platformAmount: fare.platformAmount,

            surgeMultiplier: fare.surgeMultiplier,

            status: 'REQUESTED',
            paymentStatus,
            paymentIntentId: storedPaymentIntentId,
            paymentMethodId,
            stripePaymentStatus,
            deniedBy: [],
        });

        const saved = await ride.save();

        const payment = new Payment({
            ride: saved._id,
            rider: currentUser._id,
            paymentIntentId: storedPaymentIntentId,
            authorizationId: storedPaymentIntentId,
            stripeStatus: stripePaymentStatus,
            amount: fare.estimatedFare,
            driverAmount: fare.driverAmount,
            platformAmount: fare.platformAmount,
            status: paymentStatus === 'AUTHORIZED' ? 'AUTHORIZED' : 'PENDING',
            provider: 'stripe',
        });

        await payment.save();

        return {
            ...saved._doc,
            _id: saved.id,
            rider: social.userObject(currentUser),
            driver: null,
            createdAt: new Date(saved.createdAt).toISOString(),
        };
    },

    acceptRide: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to accept a ride.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            throw new Error('Driver profile not found.');
        }

        if (driver.status !== 'APPROVED') {
            throw new Error('Only approved drivers can accept rides.');
        }

        if (!driver.online) {
            throw new Error('Driver must be online to accept rides.');
        }

        const ride = await Ride.findById(args.rideId);

        if (!ride) {
            throw new Error('Ride not found.');
        }

        if (ride.status !== 'REQUESTED') {
            throw new Error('Ride is no longer available.');
        }

        ride.driver = driver._id;
        ride.status = 'ACCEPTED';

        const saved = await ride.save();

        return {
            ...saved._doc,
            _id: saved.id,
            rider: await user(saved.rider),
            driver: {
                ...driver._doc,
                _id: driver.id,
                user: social.userObject(currentUser),
            },
            createdAt: new Date(saved.createdAt).toISOString(),
        };
    },

    arriveRide: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to update the ride.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            throw new Error('Driver profile not found.');
        }

        const ride = await Ride.findById(args.rideId);

        if (!ride) {
            throw new Error('Ride not found.');
        }

        if (!ride.driver || String(ride.driver) !== String(driver._id)) {
            throw new Error('You are not assigned to this ride.');
        }

        if (ride.status !== 'ACCEPTED') {
            throw new Error('Ride must be accepted before arrival.');
        }

        ride.status = 'DRIVER_ARRIVING';

        const saved = await ride.save();

        return {
            ...saved._doc,
            _id: saved.id,
            rider: await user(saved.rider),
            driver: {
                ...driver._doc,
                _id: driver.id,
                user: social.userObject(currentUser),
            },
            createdAt: new Date(saved.createdAt).toISOString(),
        };
    },

    startRide: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to start the ride.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            throw new Error('Driver profile not found.');
        }

        const ride = await Ride.findById(args.rideId);

        if (!ride) {
            throw new Error('Ride not found.');
        }

        if (!ride.driver || String(ride.driver) !== String(driver._id)) {
            throw new Error('You are not assigned to this ride.');
        }

        if (
            ride.status !== 'ACCEPTED' &&
            ride.status !== 'DRIVER_ARRIVING' &&
            ride.status !== 'DRIVER_ARRIVED'
        ) {
            throw new Error('Ride must be accepted before it can start.');
        }

        ride.status = 'IN_PROGRESS';

        const saved = await ride.save();

        return {
            ...saved._doc,
            _id: saved.id,
            rider: await user(saved.rider),
            driver: {
                ...driver._doc,
                _id: driver.id,
                user: social.userObject(currentUser),
            },
            createdAt: new Date(saved.createdAt).toISOString(),
        };
    },

    completeRide: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to complete the ride.'
        );

        const driver = await Driver.findOne({
            user: currentUser._id,
        });

        if (!driver) {
            throw new Error('Driver profile not found.');
        }

        const ride = await Ride.findById(args.rideId);

        if (!ride) {
            throw new Error('Ride not found.');
        }

        if (!ride.driver || String(ride.driver) !== String(driver._id)) {
            throw new Error('You are not assigned to this ride.');
        }

        if (ride.status !== 'IN_PROGRESS') {
            throw new Error('Ride must be in progress before completion.');
        }

        ride.finalFare = ride.estimatedFare;

        const riderUser = await User.findById(ride.rider);
        if (!riderUser) {
            throw new Error('Rider account was not found.');
        }

        let paymentIntent;

        if (ride.paymentIntentId) {
            paymentIntent = await capturePaymentIntent(ride.paymentIntentId);
        } else if (ride.paymentMethodId) {
            paymentIntent = await chargeRideOnComplete({
                user: riderUser,
                amount: ride.estimatedFare,
                paymentMethodId: ride.paymentMethodId,
                metadata: {
                    rideId: String(ride._id),
                },
            });
            ride.paymentIntentId = paymentIntent.id;
        } else {
            throw new Error('This ride has no saved payment card.');
        }

        const paymentStatus = mapPaymentStatus(
            paymentIntent.status
        );

        if (paymentIntent.status !== 'succeeded') {
            throw new Error(
                `Stripe payment was not captured (status: ${paymentIntent.status}).`
            );
        }

        ride.status = 'COMPLETED';
        ride.paymentStatus = paymentStatus;
        ride.stripePaymentStatus = paymentIntent.status;

        const saved = await ride.save();

        /*
         * Record/update the payment transaction.
         */
        let payment = await Payment.findOne({
            ride: saved._id,
        });

        if (!payment) {
            payment = new Payment({
                ride: saved._id,
                rider: saved.rider,
                authorizationId: paymentIntent.id,
                paymentIntentId: paymentIntent.id,
                stripeStatus: paymentIntent.status,
                capturedAt: new Date(),
                amount: saved.finalFare || saved.estimatedFare,
                driverAmount: saved.driverAmount,
                platformAmount: saved.platformAmount,
                status: paymentStatus,
                provider: 'stripe',
            });
        } else {
            payment.authorizationId = paymentIntent.id;
            payment.paymentIntentId = paymentIntent.id;
            payment.stripeStatus = paymentIntent.status;
            payment.status = paymentStatus;
            payment.capturedAt = new Date();
        }

        await payment.save();

        /*
         * Only credit driver earnings after Stripe capture succeeds.
         */
        driver.completedRides =
            Number(driver.completedRides || 0) + 1;

        driver.totalEarnings =
            Number(driver.totalEarnings || 0) +
            Number(saved.driverAmount || 0);

        await driver.save();

        return {
            ...saved._doc,
            _id: saved.id,
            rider: await user(saved.rider),
            driver: {
                ...driver._doc,
                _id: driver.id,
                user: social.userObject(currentUser),
            },
            createdAt: new Date(saved.createdAt).toISOString(),
        };
    },

    captureRidePayment: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to capture the ride payment.'
        );

        const ride = await Ride.findById(args.rideId);

        if (!ride) {
            throw new Error('Ride not found.');
        }

        if (String(ride.rider) !== String(currentUser._id)) {
            throw new Error(
                'You are not authorized to capture this payment.'
            );
        }

        if (!ride.paymentIntentId) {
            throw new Error(
                'This ride has no Stripe payment intent.'
            );
        }

        if (ride.status !== 'COMPLETED') {
            throw new Error(
                'Ride must be completed before payment is captured.'
            );
        }

        const paymentIntent = await capturePaymentIntent(
            ride.paymentIntentId
        );

        const paymentStatus = mapPaymentStatus(
            paymentIntent.status
        );

        ride.paymentStatus = paymentStatus;
        ride.stripePaymentStatus = paymentIntent.status;

        const saved = await ride.save();

        let payment = await Payment.findOne({
            ride: saved._id,
        });

        if (!payment) {
            payment = new Payment({
                ride: saved._id,
                rider: saved.rider,
                authorizationId: paymentIntent.id,
                paymentIntentId: paymentIntent.id,
                stripeStatus: paymentIntent.status,
                capturedAt:
                    paymentIntent.status === 'succeeded'
                        ? new Date()
                        : null,
                amount: saved.finalFare || saved.estimatedFare,
                driverAmount: saved.driverAmount,
                platformAmount: saved.platformAmount,
                status: paymentStatus,
                provider: 'stripe',
            });
        } else {
            payment.authorizationId = paymentIntent.id;
            payment.paymentIntentId = paymentIntent.id;
            payment.stripeStatus = paymentIntent.status;
            payment.status = paymentStatus;
            payment.capturedAt =
                paymentIntent.status === 'succeeded'
                    ? new Date()
                    : null;
        }

        await payment.save();

        const driver = saved.driver
            ? await Driver.findById(saved.driver)
            : null;

        return {
            ...saved._doc,
            _id: saved.id,
            rider: social.userObject(currentUser),
            driver: driver
                ? {
                    ...driver._doc,
                    _id: driver.id,
                }
                : null,
            createdAt: new Date(saved.createdAt).toISOString(),
        };
    },

    cancelRide: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to cancel the ride.'
        );

        const ride = await Ride.findById(args.rideId);

        if (!ride) {
            throw new Error('Ride not found.');
        }

        const isRider =
            String(ride.rider) === String(currentUser._id);

        const driver =
            ride.driver
                ? await Driver.findById(ride.driver)
                : null;

        const isDriver =
            driver &&
            String(driver.user) === String(currentUser._id);

        if (!isRider && !isDriver) {
            throw new Error('You are not authorized to cancel this ride.');
        }

        if (
            ride.status === 'COMPLETED' ||
            ride.status === 'CANCELLED'
        ) {
            throw new Error('Ride cannot be cancelled.');
        }

        ride.status = 'CANCELLED';

        const saved = await ride.save();

        return {
            ...saved._doc,
            _id: saved.id,
            rider: await user(saved.rider),
            driver: driver
                ? {
                    ...driver._doc,
                    _id: driver.id,
                    user: social.userObject(
                        await User.findById(driver.user)
                    ),
                }
                : null,
            createdAt: new Date(saved.createdAt).toISOString(),
        };
    },

    reverseGeocode: async (args) => {
        const result = await reverseGeocode(args.lat, args.lng);
        if (!result) {
            return {
                address: `${Number(args.lat).toFixed(5)}, ${Number(args.lng).toFixed(5)}`,
                lat: Number(args.lat),
                lng: Number(args.lng),
                zipCode: '',
            };
        }
        return result;
    },

    quoteRide: async (args) => {
        const {
            pickup,
            destination,
            distanceMiles,
            durationMinutes,
            surgeMultiplier = 1,
        } = args.input;

        let miles = Number(distanceMiles);
        let minutes = Number(durationMinutes);

        if (
            pickup &&
            destination &&
            isValidCoord(Number(pickup.lat), Number(pickup.lng)) &&
            isValidCoord(Number(destination.lat), Number(destination.lng))
        ) {
            const route = await routeBetween(pickup, destination);
            miles = route.distanceMiles;
            minutes = route.durationMinutes;
        }

        const fare = calculateFare({
            distanceMiles: miles,
            durationMinutes: minutes,
            surgeMultiplier,
        });

        return {
            distanceMiles: fare.distanceMiles,
            durationMinutes: fare.durationMinutes,
            estimatedFare: fare.estimatedFare,
            driverAmount: fare.driverAmount,
            platformAmount: fare.platformAmount,
        };
    },

    events: async (_args, context) => {
        try {
            const currentUser = await requireAuth(
                context,
                'Please register or log in to see events.'
            );

            const events = await Event.find({
                zipCode: currentUser.zipCode,
            }).sort({ date: 1 });

            return events.map((event) => {
                return transformEvent(event);
            });
        } catch (err) {
            throw err;
        }
    },
    // Scoped to the requesting user: a booking is only ever visible to the person who made it.
    bookings: async (_args, context) => {
        try {
            const bookingUser = await requireAuth(context, 'Please log in to see your bookings.');
            const bookings = await Booking.find({ user: bookingUser._id });
            return bookings.map(transformBooking);
        } catch (err) {
            throw err;
        }
    },
    hostBookings: async (_args, context) => {
    try {
        const host = await requireAuth(
            context,
            'Please log in to see your event bookings.'
        );

        const events = await Event.find({
            creator: host._id,
        }).select('_id');

        const eventIds = events.map((event) => event._id);

        const bookings = await Booking.find({
            event: { $in: eventIds },
        }).sort({ createdAt: -1 });

        return bookings.map(transformBooking);
    } catch (err) {
        throw err;
    }
    },
    notifications: async (_args, context) => {
    try {
        const host = await requireAuth(
            context,
            'Please log in to see your notifications.'
        );

        const notifications = await Notification.find({
            recipient: host._id,
        }).sort({ createdAt: -1 });

        return notifications.map((notification) => ({
            ...notification._doc,
            _id: notification.id,
            booking: findBookingOrThrow.bind(
                this,
                notification._doc.booking
            ),
            event: singleEvent.bind(
                this,
                notification._doc.event
            ),
            user: user.bind(
                this,
                notification._doc.user
            ),
            createdAt: new Date(
                notification._doc.createdAt
            ).toISOString(),
        }));
    } catch (err) {
        throw err;
    }
    },
    // Public tally of every booking made on the platform.
    bookingsCount: async () => {
        try {
            return await Booking.countDocuments();
        } catch (err) {
            throw err;
        }
    },

    updateProfile: async (args, context) => {
        const currentUser = await requireAuth(
            context,
            'Please log in to update your profile.'
        );

        if (args.firstName !== undefined) {
            currentUser.firstName = String(args.firstName).trim();
        }

        if (args.lastName !== undefined) {
            currentUser.lastName = String(args.lastName).trim();
        }

        if (args.phone !== undefined) {
            currentUser.phone = String(args.phone).trim();
        }

        if (args.zipCode !== undefined) {
            const zip = String(args.zipCode).trim();

            if (!/^\\d{5}$/.test(zip)) {
                throw new Error('ZIP code must be exactly 5 digits.');
            }

            currentUser.zipCode = zip;
        }

        if (args.bio !== undefined) {
            currentUser.bio = String(args.bio).trim();
        }

        if (args.profileImage !== undefined) {
            currentUser.profileImage = String(args.profileImage).trim();
        }

        const saved = await currentUser.save();

        return social.userObject(saved);
    },

    followUser: async (args, context) => {
        return social.followUser(args, context);
    },

    unfollowUser: async (args, context) => {
        return social.unfollowUser(args, context);
    },

    createComment: async (args, context) => {
        return social.createComment(args, context);
    },

    deleteComment: async (args, context) => {
        return social.deleteComment(args, context);
    },

    likeComment: async (args, context) => {
        return social.likeComment(args, context);
    },

    unlikeComment: async (args, context) => {
        return social.unlikeComment(args, context);
    },

    sendMessage: async (args, context) => {
        return social.sendMessage(args, context);
    },

    markMessageRead: async (args, context) => {
        return social.markMessageRead(args, context);
    },

    markNotificationRead: async (args, context) => {
        const user = await requireAuth(
            context,
            'Please log in to continue.'
        );

        const notification = await AppNotification.findOne({
            _id: args.notificationId,
            recipient: user._id,
        });

        if (!notification) {
            throw new Error('Notification not found.');
        }

        notification.read = true;
        await notification.save();

        return {
            ...notification._doc,
            _id: notification.id,
            createdAt: new Date(notification.createdAt).toISOString(),
        };
    },

    createEvent: async (args, context) => {
        try {
            const creator = await requireAuth(context, 'Please log in before creating an event.');
            const zipCode = String(args.eventInput.zipCode || '').trim();

            if (!/^\d{5}$/.test(zipCode)) {
                throw new Error('ZIP code must be exactly 5 digits');
            }

            const event = new Event({
                title: args.eventInput.title,
                description: args.eventInput.description,
                price: +args.eventInput.price,
                date: new Date(args.eventInput.date),
                zipCode,
                image: String(args.eventInput.imageUrl || '').trim(),
                creator: creator._id,
            });
            const result = await event.save();
            const createdEvent = transformEvent(result);

            creator.createdEvents.push(event);
            await creator.save();

            return createdEvent;
        }   catch (err) {
            console.log(err);
            throw err;
        }
    },
    updateEvent: async (args, context) => {
        try {
            const editor = await requireAuth(context, 'Please log in before editing an event.');
            const found = await findEventOrThrow(args.eventId);
            ensureOwner(found.creator, editor._id, 'You can only edit events you created.');

            found.title = args.eventInput.title;
            found.description = args.eventInput.description;
            found.price = +args.eventInput.price;
            found.date = new Date(args.eventInput.date);

            if (args.eventInput.zipCode !== undefined) {
                const zipCode = String(args.eventInput.zipCode || '').trim();
                if (!/^\d{5}$/.test(zipCode)) {
                    throw new Error('ZIP code must be exactly 5 digits');
                }
                found.zipCode = zipCode;
            }

            if (args.eventInput.imageUrl !== undefined) {
                found.image = String(args.eventInput.imageUrl || '').trim();
            }

            const result = await found.save();

            return transformEvent(result);
        } catch (err) {
            if (err && /Cast to ObjectId failed/.test(err.message)) {
                throw new Error('Event not found');
            }
            throw err;
        }
    },
    deleteEvent: async (args, context) => {
        try {
            const editor = await requireAuth(context, 'Please log in before deleting an event.');
            const found = await findEventOrThrow(args.eventId);
            ensureOwner(found.creator, editor._id, 'You can only delete events you created.');

            const deletedEvent = transformEvent(found);
            // Bookings for a deleted event would dangle, so clear them out too.
            await Booking.deleteMany({ event: found._id });
            await Event.deleteOne({ _id: found._id });
            await User.updateOne({ _id: editor._id }, { $pull: { createdEvents: found._id } });

            return deletedEvent;
        } catch (err) {
            if (err && /Cast to ObjectId failed/.test(err.message)) {
                throw new Error('Event not found');
            }
            throw err;
        }
    },
    createUser: async (args) => {
        try {
            const firstName = String(args.userInput.firstName || '').trim();
            const lastName = String(args.userInput.lastName || '').trim();
            const phone = String(args.userInput.phone || '').trim();
            const zipCode = String(args.userInput.zipCode || '').trim();

            if (!/^\d{5}$/.test(zipCode)) {
                throw new Error('ZIP code must be exactly 5 digits');
            }

            const email = String(args.userInput.email || '').trim().toLowerCase();
            if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                throw new Error('Invalid email');
            }
            const existingUser = await User.findOne({ email: { $eq: email } });
            if (existingUser) {
                throw new Error('User exists already.');
            }
            const passwordRaw = String(args.userInput.password || '');
            if (passwordRaw.length < 6) {
                throw new Error('Password must be at least 6 characters');
            }
            const hashedPassword = await bcrypt.hash(passwordRaw, 12);
            const user = new User({
                firstName,
                lastName,
                phone,
                zipCode,
                email,
                password: hashedPassword,
            });

            const result = await user.save();
            return { ...result._doc, password: null, _id: result._id };
        } catch (err) {
            throw err;
        }
    },
    login: async (args) => {
        try {
            const loginInput = args.loginInput || args.userInput;

            if (!loginInput) {
                throw new Error('Incorrect email or password.');
            }

            const email = String(loginInput.email || '').trim().toLowerCase();
            const password = String(loginInput.password || '');

            const foundUser = await User.findOne({ email: { $eq: email } });
            if (!foundUser || !(await bcrypt.compare(password, foundUser.password))) {
                throw new Error('Incorrect email or password.');
            }
            const normalizedEmail = String(foundUser.email || '').trim().toLowerCase();

            // The single authoritative administrator account.
            if (normalizedEmail === 'echolsbrysonkyle@gmail.com') {
                if (foundUser.role !== 'admin') {
                    foundUser.role = 'admin';
                    await foundUser.save();
                }
            } else if (foundUser.role === 'admin') {
                foundUser.role = 'user';
                await foundUser.save();
            }

            const token = jwt.sign(
                {
                    userId: foundUser.id,
                    email: foundUser.email,
                    role: foundUser.role,
                },
                jwtSecret(),
                { expiresIn: `${TOKEN_EXPIRATION_HOURS}h` },
            );
            return {
                userId: foundUser.id,
                email: foundUser.email,
                token,
                tokenExpiration: TOKEN_EXPIRATION_HOURS,
            };
        } catch (err) {
            throw err;
        }
    },
    bookEvent: async (args, context) => {
    try {
        const bookingUser = await requireAuth(
            context,
            'Please log in before booking an event.'
        );

        const fetchedEvent = await findEventOrThrow(args.eventId);

        // Prevent users from booking their own event.
        if (
            fetchedEvent.creator &&
            fetchedEvent.creator.toString() === bookingUser._id.toString()
        ) {
            throw new Error('You cannot book your own event.');
        }

        const booking = new Booking({
            user: bookingUser._id,
            event: fetchedEvent._id,
        });

        const result = await booking.save();

        // Notify the event owner.
        if (fetchedEvent.creator) {
            const fullName = [
                bookingUser.firstName,
                bookingUser.lastName,
            ]
                .filter(Boolean)
                .join(' ');

            const displayName = fullName || bookingUser.email;

            await Notification.create({
                type: 'NEW_BOOKING',
                message: `${displayName} booked your event "${fetchedEvent.title}".`,
                booking: result._id,
                event: fetchedEvent._id,
                user: bookingUser._id,
                recipient: fetchedEvent.creator,
            });
        }

        return transformBooking(result);
    } catch (err) {
        if (err && /Cast to ObjectId failed/.test(err.message)) {
            throw new Error('Event not found');
        }

        throw err;
    }
    },
    cancelBooking: async (args, context) => {
        try {
            const bookingUser = await requireAuth(context, 'Please log in before cancelling a booking.');
            const booking = await findBookingOrThrow(args.bookingId);
            ensureOwner(booking.user, bookingUser._id, 'You can only cancel your own bookings.');
            const eventData = transformEvent(booking.event);
            await Booking.deleteOne({ _id: booking._id });
            return eventData;
        } catch (err) {
            if (err && /Cast to ObjectId failed/.test(err.message)) {
                throw new Error('Booking not found');
            }
            throw err;
        }
    },

    me: async (_args, context) => {
        return requireAuth(context);
    },

    myDriver: async (_args, context) => {
        const u = await requireAuth(context);
        const d = await Driver.findOne({ user: u._id });
        return d ? transformDriver(d) : null;
    },

    adminDrivers: async (_args, context) => {
        await requireAdmin(context);

        const drivers = await Driver.find().sort({ createdAt: -1 });
        return Promise.all(drivers.map(transformDriver));
    },

    availableRides: async (_args, context) => {
        const driver = await getApprovedDriver(context);
        if (!driver.online) return [];

        const rides = await Ride.find({
            status: 'REQUESTED',
            driver: null,
            deniedBy: { $ne: driver._id },
        }).sort({ createdAt: 1 });

        return Promise.all(rides.map(transformRide));
    },

    myRides: async (_args, context) => {
        const driver = await getApprovedDriver(context);

        const rides = await Ride.find({
            driver: driver._id,
        }).sort({ createdAt: -1 });

        return Promise.all(rides.map(transformRide));
    },

    applyAsDriver: async (args, context) => {
        const u = await requireAuth(context);

        const existing = await Driver.findOne({ user: u._id });

        const data = args.driverInput;

        const payload = {
            user: u._id,
            firstName: data.firstName || u.firstName || '',
            lastName: data.lastName || u.lastName || '',
            phone: data.phone || u.phone || '',
            vehicleMake: data.vehicleMake,
            vehicleModel: data.vehicleModel,
            vehicleColor: data.vehicleColor,
            vehicleYear: Number(data.vehicleYear),
            licensePlate: String(data.licensePlate).trim().toUpperCase(),
            status: 'PENDING',
            vehicleStatus: 'PENDING',
            online: false,
            deniedReason: '',
            vehicleDeniedReason: '',
        };

        const d = existing
            ? await Driver.findByIdAndUpdate(
                existing._id,
                payload,
                { new: true, runValidators: true }
            )
            : await new Driver(payload).save();

        return transformDriver(d);
    },

    approveDriver: async (args, context) => {
        await requireAdmin(context);

        const d = await Driver.findById(args.driverId);
        if (!d) throw new Error('Driver not found.');

        d.status = 'APPROVED';
        d.deniedReason = '';
        d.online = false;
        await d.save();

        return transformDriver(d);
    },

    denyDriver: async (args, context) => {
        await requireAdmin(context);

        const d = await Driver.findById(args.driverId);
        if (!d) throw new Error('Driver not found.');

        d.status = 'DENIED';
        d.online = false;
        d.deniedReason = String(args.reason || 'Driver application denied.');
        await d.save();

        return transformDriver(d);
    },

    approveVehicle: async (args, context) => {
        await requireAdmin(context);

        const d = await Driver.findById(args.driverId);
        if (!d) throw new Error('Driver not found.');

        d.vehicleStatus = 'APPROVED';
        d.vehicleDeniedReason = '';
        await d.save();

        return transformDriver(d);
    },

    denyVehicle: async (args, context) => {
        await requireAdmin(context);

        const d = await Driver.findById(args.driverId);
        if (!d) throw new Error('Driver not found.');

        d.vehicleStatus = 'DENIED';
        d.vehicleDeniedReason = String(args.reason || 'Vehicle denied.');
        d.online = false;
        await d.save();

        return transformDriver(d);
    },

    setDriverOnline: async (args, context) => {
        const d = await getApprovedDriver(context);

        d.online = !!args.online;
        await d.save();

        return transformDriver(d);
    },

    acceptRide: async (args, context) => {
        const driver = await getApprovedDriver(context);

        const ride = await Ride.findOneAndUpdate(
            {
                _id: args.rideId,
                status: 'REQUESTED',
                driver: null,
            },
            {
                $set: {
                    driver: driver._id,
                    status: 'ACCEPTED',
                    updatedAt: new Date(),
                },
            },
            {
                new: true,
            }
        );

        if (!ride) {
            throw new Error('Ride is no longer available.');
        }

        return transformRide(ride);
    },

    rejectRide: async (args, context) => {
        const driver = await getApprovedDriver(context);

        const ride = await Ride.findOneAndUpdate(
            {
                _id: args.rideId,
                status: 'REQUESTED',
                driver: null,
            },
            {
                $addToSet: { deniedBy: driver._id },
                $set: { updatedAt: new Date() },
            },
            {
                new: true,
            }
        );

        if (!ride) {
            throw new Error('Ride is no longer available.');
        }

        return transformRide(ride);
    },

};

// Export helpers for testing
module.exports.__test = { transformEvent, singleEvent };

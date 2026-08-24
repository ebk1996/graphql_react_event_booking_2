const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Event = require('../../models/event');
const User = require('../../models/user');
const Booking = require('../../models/booking');
const Notification = require('../../models/notification');
const { isValidObjectId, ensureValidObjectId, ensureOwner } = require('./helpers');
const { createTransformEvent } = require('./transform');
const { jwtSecret, TOKEN_EXPIRATION_HOURS } = require('../../config/auth');
const social = require('./social');
const { Comment, Message } = require('../models/Social');
const AppNotification = require('../models/AppNotification');
const { calculateFare } = require('../services/fare');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Card = require('../models/Card');
const Payment = require('../models/Payment');

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

module.exports = {
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

    quoteRide: async (args) => {
        const {
            distanceMiles,
            durationMinutes,
            surgeMultiplier = 1,
        } = args.input;

        const fare = calculateFare({
            distanceMiles,
            durationMinutes,
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
            const token = jwt.sign(
                { userId: foundUser.id, email: foundUser.email },
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
};

// Export helpers for testing
module.exports.__test = { transformEvent, singleEvent };

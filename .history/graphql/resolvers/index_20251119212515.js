const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Event = require('../../models/event');
const User = require('../../models/user');
const Booking = require('../../models/Booking');

const transformEvent = (event) => {
    return {
        ...event._doc,
        _id: event._doc._id.toString(),
        date: new Date(event._doc.date).toISOString(),
        creator: user.bind(this, event._doc.creator)
    };
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
        // If the id is not a valid ObjectId, normalize to not found
        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            throw new Error('Event not found');
        }
        const found = await Event.findById(eventId);
        if (!found) {
            throw new Error('Event not found');
        }
        return transformEvent(found);
    } catch (err) {
        // Cast errors from Mongoose should map to the expected not found error for consistency
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
module.exports = {
    events: async () => {
        try {
            const events = await Event.find();
            return events.map((event) => {
                return transformEvent(event);
            });
        } catch (err) {
            throw err;
        }
    },
    bookings: async () => {
        try {
            const bookings = await Booking.find();
            return bookings.map((booking) => {
                return {
                    ...booking._doc,
                    _id: booking.id,
                    user: user.bind(this, booking._doc.user),
                    event: singleEvent.bind(this, booking._doc.event),
                    createdAt: new Date(booking._doc.createdAt).toISOString(),
                    updatedAt: new Date(booking._doc.updatedAt).toISOString(),
                };
            });
        } catch (err) {
            throw err;
        }
    },
    createEvent: async (args) => {
        try {
            const event = new Event({
                title: args.eventInput.title,
                description: args.eventInput.description,
                price: +args.eventInput.price,
                date: new Date(args.eventInput.date),
                creator: '6919227d0927332f841c4e7e',
            });
            const result = await event.save();
            const createdEvent = transformEvent(result);

            const creator = await User.findById('6919227d0927332f841c4e7e');
            if (!creator) {
                throw new Error('User not found.');
            }

            creator.createdEvents.push(event);
            await creator.save();

            return createdEvent;
        }   catch (err) {
            console.log(err);
            throw err;
        }
    },
    createUser: async (args) => {
        try {
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
                email,
                password: hashedPassword,
            });

            const result = await user.save();
            return { ...result._doc, password: null, _id: result._id };
        } catch (err) {
            throw err;
        }
    },
    bookEvent: async (args) => {
        const fetchedEvent = await Event.findById(args.eventId);
        if (!fetchedEvent) {
            throw new Error('Event not found.');
        }
        const booking = new Booking({
            user: '6919227d0927332f841c4e7e',
            event: args.eventId,
        });

        const result = await booking.save();
        return {
            ...result._doc,
            _id: result._id,
            user: user.bind(this, booking._doc.user),
            event: singleEvent.bind(this, booking._doc.event),
            createdAt: new  Date(result._doc.createdAt).toISOString(),
            updatedAt: new Date(result._doc.updatedAt).toISOString(),
        };
    },
    cancelBooking: async (args) => {
        try {
            const booking = await Booking.findById(args.bookingId).populate('event');
            if (!booking) {
                throw new Error('Booking not found.');
            }
            // booking.event is populated Event document
            const eventData = transformEvent(booking.event);
            await Booking.deleteOne({ _id: args.bookingId });
            return eventData;
        } catch (err) {
            throw err;
        }
    },
};

// Export helpers for testing
module.exports.__test = { transformEvent, singleEvent };
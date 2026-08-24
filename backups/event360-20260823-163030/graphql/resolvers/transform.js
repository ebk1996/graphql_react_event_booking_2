// Factory to avoid circular dependency on user resolver
const createTransformEvent = (userResolver) => (event) => {
    return {
        ...event._doc,
        _id: event._doc._id.toString(),
        date: new Date(event._doc.date).toISOString(),
        creator: userResolver.bind(this, event._doc.creator),
    };
};

module.exports = { createTransformEvent };
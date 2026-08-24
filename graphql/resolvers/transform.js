const createTransformEvent = (userResolver) => {
    return (event) => ({
        ...event._doc,
        _id: event.id || event._doc._id,

        // Convert Mongo Date -> ISO string
        date: event._doc.date
            ? new Date(event._doc.date).toISOString()
            : null,

        imageUrl: event._doc.image || '',

        creator: userResolver.bind(null, event._doc.creator),
    });
};

module.exports = {
    createTransformEvent,
};

const createTransformEvent = (userResolver) => {
    return (event) => ({
        ...event._doc,
        _id: event.id || event._doc._id,

        imageUrl: event._doc.image || '',

        creator: userResolver.bind(null, event._doc.creator),
    });
};

module.exports = {
    createTransformEvent,
};

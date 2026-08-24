const createTransformEvent = (userResolver) => {
    return (event) => ({
        ...event._doc,
        _id: event.id,

        imageUrl: event._doc.image || '',

        creator: userResolver.bind(null, event._doc.creator),
    });
};

module.exports = {
    createTransformEvent,
};

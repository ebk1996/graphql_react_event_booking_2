const mongoose = require('mongoose');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const ensureValidObjectId = (id, notFoundMessage) => {
    if (!isValidObjectId(id)) {
        throw new Error(notFoundMessage);
    }
};

// Ownership check for user-scoped mutations (edit/delete an event, cancel a booking).
const ensureOwner = (ownerId, userId, message) => {
    if (!ownerId || String(ownerId) !== String(userId)) {
        throw new Error(message);
    }
};

module.exports = { isValidObjectId, ensureValidObjectId, ensureOwner };
const mongoose = require('mongoose');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const ensureValidObjectId = (id, notFoundMessage) => {
    if (!isValidObjectId(id)) {
        throw new Error(notFoundMessage);
    }
};

module.exports = { isValidObjectId, ensureValidObjectId };
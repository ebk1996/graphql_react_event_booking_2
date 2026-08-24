const mongoose = require('mongoose');
const User = require('../../models/user');

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

const findUserOrThrow = async (userId, message = 'Please log in to continue.') => {
    ensureValidObjectId(userId, message);
    const found = await User.findById(userId);
    if (!found) {
        throw new Error(message);
    }
    return found;
};

const requireAuth = (context, message = 'Please log in to continue.') => {
    if (!context || !context.isAuth) {
        throw new Error(message);
    }
    return findUserOrThrow(context.userId, message);
};

const adminEmails = () => String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const isAdminUser = (user) => {
    if (!user) return false;
    if (user.isAdmin === true) return true;
    return adminEmails().includes(String(user.email || '').toLowerCase());
};

const requireAdmin = async (context, message = 'Admin access required.') => {
    const user = await requireAuth(context, message);
    if (!isAdminUser(user)) {
        throw new Error(message);
    }
    return user;
};

module.exports = {
    isValidObjectId,
    ensureValidObjectId,
    ensureOwner,
    findUserOrThrow,
    requireAuth,
    requireAdmin,
    isAdminUser,
};
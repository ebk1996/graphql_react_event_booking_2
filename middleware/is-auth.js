const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/auth');

// Decodes the bearer token if one is present. Never rejects the request itself —
// some fields (events, bookingsCount) are public, so the resolvers decide what
// requires `req.isAuth`.
module.exports = (req, _res, next) => {
    req.isAuth = false;

    const authHeader = req.get('Authorization');
    if (!authHeader) return next();

    const [scheme, token] = authHeader.split(' ');
    if (!/^Bearer$/i.test(scheme) || !token) return next();

    try {
        const decoded = jwt.verify(token, jwtSecret());
        req.isAuth = true;
        req.userId = decoded.userId;
    } catch {
        // Expired, tampered with, or signed by someone else — stays unauthenticated.
    }

    return next();
};

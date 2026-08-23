// Single source of truth for the JWT signing secret and lifetime, shared by the
// login resolver (which signs) and the auth middleware (which verifies).
const TOKEN_EXPIRATION_HOURS = 1;

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret';

const jwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production.');
    }
    return DEV_FALLBACK_SECRET;
};

module.exports = { jwtSecret, TOKEN_EXPIRATION_HOURS };

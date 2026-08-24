require('dotenv').config({ path: process.env.ENV_FILE || '.env' });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { createHandler } = require('graphql-http/lib/use/express');
const { ruruHTML } = require('ruru/server');
const mongoose = require('mongoose');

const graphQlSchema = require('./graphql/schema/index');
const graphQlResolvers = require('./graphql/resolvers/index');
const isAuth = require('./middleware/is-auth');

const app = express();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// --------------------------------------------------
// Security
// --------------------------------------------------

app.use(
    helmet({
        contentSecurityPolicy: isProduction ? undefined : false,
        crossOriginEmbedderPolicy: false,
    })
);

// --------------------------------------------------
// CORS
// --------------------------------------------------

const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
};

app.use(cors(corsOptions));

// --------------------------------------------------
// Request parsing
// --------------------------------------------------

app.use(bodyParser.json());

// --------------------------------------------------
// GraphiQL / Ruru - development only
// --------------------------------------------------

if (!isProduction) {
    app.get('/graphql', (_req, res) => {
        res.type('html');
        res.end(
            ruruHTML({
                endpoint: '/graphql',
            })
        );
    });
}

// --------------------------------------------------
// Authentication middleware
// --------------------------------------------------

app.use(isAuth);

// --------------------------------------------------
// GraphQL API
// --------------------------------------------------

app.post(
    '/graphql',
    createHandler({
        schema: graphQlSchema,
        rootValue: graphQlResolvers,

        // `req.raw` is the Express request annotated by isAuth.
        context: (req) => ({
            isAuth: req.raw.isAuth,
            userId: req.raw.userId,
        }),
    })
);

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
    });
});

// --------------------------------------------------
// Serve React production build
// --------------------------------------------------

if (isProduction) {
    const distPath = path.join(__dirname, 'dist');

    app.use(express.static(distPath));

    // React SPA fallback
    app.get('/*splat', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

// --------------------------------------------------
// MongoDB
// --------------------------------------------------

const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGODBDB_URI ||
    (
        process.env.MONGODB_USER &&
        process.env.MONGODB_PASSWORD &&
        process.env.MONGODB_DB
            ? `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@cluster0.f3u8mh3.mongodb.net/${process.env.MONGODB_DB}?retryWrites=true&w=majority`
            : 'mongodb://127.0.0.1:27017/event_booking'
    );

mongoose
    .connect(mongoUri)
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err.message);
        console.error(
            'Set MONGODB_URI in .env and make sure MongoDB is running.'
        );
    });

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);

    if (!isProduction) {
        console.log(`Frontend: http://localhost:5173`);
    }
});

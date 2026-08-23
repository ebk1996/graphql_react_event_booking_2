require('dotenv').config();
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

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Security middleware
app.use(helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
};
app.use(cors(corsOptions));

app.use(bodyParser.json());

// Serve GraphiQL interface on GET requests to /graphql (only in development)
if (!isProduction) {
    app.get('/graphql', (_req, res) => {
        res.type('html');
        res.end(ruruHTML({ endpoint: '/graphql' }));
    });
}

// GraphQL API endpoint for POST requests
app.post(
    '/graphql',
    createHandler({
        schema: graphQlSchema,
        rootValue: graphQlResolvers
    })
);

// Start server first
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    console.log('GraphQL endpoint: http://localhost:3000/graphql');
    console.log('GraphiQL interface: http://localhost:3000/graphql (GET)');
});

// Connect to MongoDB
mongoose.connect(`mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.f3u8mh3.mongodb.net/${process.env.MONGO_DB}?retryWrites=true&w=majority`)
.then(() => {
    console.log('Connected to MongoDB Atlas');
})
.catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.error('Make sure your IP is whitelisted in MongoDB Atlas Network Access');
});

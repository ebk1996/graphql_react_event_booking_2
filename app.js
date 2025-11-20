const express = require('express');
const bodyParser = require('body-parser');
const { graphqlHTTP } = require('express-graphql');
const mongoose = require('mongoose');

const graphQlSchema = require('./graphql/schema/index');
const graphQlResolvers = require('./graphql/resolvers/index');

const app = express();

app.use(bodyParser.json());

app.use(
    '/graphql',
    graphqlHTTP({
        schema: graphQlSchema,
        rootValue: graphQlResolvers,
        graphiql: true
    })  
);

// Start server first
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    console.log('GraphQL endpoint: http://localhost:3000/graphql');
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

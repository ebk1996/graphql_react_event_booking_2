const { buildSchema } = require('graphql');

module.exports = buildSchema(`
        type Booking {
        _id: ID!
        event: Event!
        user: User!
        createdAt: String!
        updatedAt: String!
        }

        type Event {
        _id: ID!
        title: String!
        description: String!
        price: Float!
        date: String!
        creator: User!
        }

        type User {
            _id: ID!
            firstName: String
            lastName: String
            phone: String
            email: String!
            password: String
            createdEvents: [Event!]
        }

        type AuthData {
            userId: ID!
            email: String!
            token: String!
            tokenExpiration: Int!
        }

        input UserInput {
        firstName: String
        lastName: String
        phone: String
        email: String!
        password: String!
        }

        input EventInput {
        title: String!
        description: String!
        price: Float!
        date: String!
        }

        type RootQuery {
            events: [Event!]!
            bookings: [Booking!]!
            bookingsCount: Int!
        }

        type RootMutation {
            createEvent(eventInput: EventInput): Event
            updateEvent(eventId: ID!, eventInput: EventInput): Event
            deleteEvent(eventId: ID!): Event
            createUser(userInput: UserInput): User
            login(userInput: UserInput): AuthData!
            bookEvent(eventId: ID!): Booking
            cancelBooking(bookingId: ID!): Event
        }

        schema {
            query: RootQuery
            mutation: RootMutation
        }
    `);

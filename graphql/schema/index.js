const { buildSchema } = require('graphql');

module.exports = buildSchema(`
  input LoginInput {
    email: String!
    password: String!
  }

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
    zipCode: String
    creator: User!
  }

  type User {
    _id: ID!
    firstName: String
    lastName: String
    phone: String
    zipCode: String
    email: String!
    role: String!
    createdEvents: [Event!]
  }

  type Notification {
    _id: ID!
    type: String
    message: String
    createdAt: String
    event: Event
  }

  type AuthData {
    userId: ID!
    email: String!
    role: String!
    token: String!
    tokenExpiration: Int!
  }

  type Driver {
    _id: ID!
    user: User
    firstName: String
    lastName: String
    phone: String
    vehicleMake: String!
    vehicleModel: String!
    vehicleColor: String!
    vehicleYear: Int!
    licensePlate: String!
    status: String!
    vehicleStatus: String!
    online: Boolean!
    deniedReason: String
    vehicleDeniedReason: String
    completedRides: Int!
    totalEarnings: Float!
    rating: Float!
    createdAt: String
    updatedAt: String
  }

  type Ride {
    _id: ID!
    rider: User
    driver: Driver
    pickup: String!
    destination: String!
    distanceMiles: Float
    durationMinutes: Float
    fare: Float
    estimatedFare: Float
    finalFare: Float
    driverAmount: Float
    platformAmount: Float
    surgeMultiplier: Float
    status: String!
    paymentStatus: String
    paymentIntentId: String
    createdAt: String
    updatedAt: String
  }

  type RideQuote {
    distanceMiles: Float!
    durationMinutes: Float!
    estimatedFare: Float!
    driverAmount: Float!
    platformAmount: Float!
  }

  type GeocodeResult {
    address: String!
    lat: Float!
    lng: Float!
    zipCode: String
  }

  type PaymentIntentResult {
    paymentIntentId: String!
    clientSecret: String
    status: String!
    amount: Float!
    paymentStatus: String!
  }

  input RideLocationInput {
    address: String!
    lat: Float!
    lng: Float!
    zipCode: String
  }

  input RideQuoteInput {
    pickup: RideLocationInput!
    destination: RideLocationInput!
    distanceMiles: Float
    durationMinutes: Float
    surgeMultiplier: Float
  }

  input UserInput {
    firstName: String
    lastName: String
    phone: String
    zipCode: String
    email: String!
    password: String!
  }

  input EventInput {
    title: String!
    description: String!
    price: Float!
    date: String!
    zipCode: String
  }

  input DriverInput {
    firstName: String
    lastName: String
    phone: String
    vehicleMake: String!
    vehicleModel: String!
    vehicleColor: String!
    vehicleYear: Int!
    licensePlate: String!
  }

  type StripeConfig {
    publishableKey: String!
    configured: Boolean!
  }

  type RootQuery {
    stripeConfig: StripeConfig!
    events: [Event!]!
    bookings: [Booking!]!
    bookingsCount: Int!

    me: User
    myDriver: Driver
    notifications: [Notification!]!

    quoteRide(input: RideQuoteInput!): RideQuote!
    reverseGeocode(lat: Float!, lng: Float!): GeocodeResult

    adminDrivers: [Driver!]!
    availableRides: [Ride!]!
    myRides: [Ride!]!
  }

  type RootMutation {
    createEvent(eventInput: EventInput): Event
    updateEvent(eventId: ID!, eventInput: EventInput): Event
    deleteEvent(eventId: ID!): Event
    createUser(userInput: UserInput): User
    login(loginInput: LoginInput!): AuthData!
    bookEvent(eventId: ID!): Booking
    cancelBooking(bookingId: ID!): Event

    applyAsDriver(driverInput: DriverInput!): Driver

    approveDriver(driverId: ID!): Driver
    denyDriver(driverId: ID!, reason: String): Driver

    approveVehicle(driverId: ID!): Driver
    denyVehicle(driverId: ID!, reason: String): Driver

    setDriverOnline(online: Boolean!): Driver

    createRidePaymentIntent(
      pickup: RideLocationInput!
      destination: RideLocationInput!
      distanceMiles: Float!
      durationMinutes: Float!
      paymentMethodId: String!
      surgeMultiplier: Float
    ): PaymentIntentResult!

    requestRide(
      pickup: RideLocationInput!
      destination: RideLocationInput!
      distanceMiles: Float
      durationMinutes: Float
      surgeMultiplier: Float
      paymentIntentId: String
      paymentMethodId: String
    ): Ride

    acceptRide(rideId: ID!): Ride
    rejectRide(rideId: ID!): Ride
    arriveRide(rideId: ID!): Ride
    startRide(rideId: ID!): Ride
    completeRide(rideId: ID!): Ride
    cancelRide(rideId: ID!): Ride
  }

  schema {
    query: RootQuery
    mutation: RootMutation
  }
`);

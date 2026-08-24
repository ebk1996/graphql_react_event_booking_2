const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const rideSchema = new Schema({
  rider: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  driver: {
    type: Schema.Types.ObjectId,
    ref: 'Driver',
    default: null,
  },

  pickup: {
    type: String,
    required: true,
  },

  destination: {
    type: String,
    required: true,
  },

  pickupLat: {
    type: Number,
    default: null,
  },

  pickupLng: {
    type: Number,
    default: null,
  },

  destinationLat: {
    type: Number,
    default: null,
  },

  destinationLng: {
    type: Number,
    default: null,
  },

  deniedBy: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
    },
  ],

  distanceMiles: {
    type: Number,
    default: 0,
  },

  durationMinutes: {
    type: Number,
    default: 0,
  },

  fare: {
    type: Number,
    default: 0,
  },

  estimatedFare: {
    type: Number,
    default: 0,
  },

  finalFare: {
    type: Number,
    default: null,
  },

  driverAmount: {
    type: Number,
    default: 0,
  },

  platformAmount: {
    type: Number,
    default: 0,
  },

  surgeMultiplier: {
    type: Number,
    default: 1,
  },

  paymentStatus: {
    type: String,
    default: '',
  },

  paymentIntentId: {
    type: String,
    default: '',
  },

  paymentMethodId: {
    type: String,
    default: '',
  },

  stripePaymentStatus: {
    type: String,
    default: '',
  },

  status: {
    type: String,
    enum: [
      'REQUESTED',
      'ACCEPTED',
      'DRIVER_REJECTED',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED'
    ],
    default: 'REQUESTED',
    index: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

rideSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Ride', rideSchema);

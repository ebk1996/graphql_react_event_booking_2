const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },

    pickup: {
      address: String,
      lat: Number,
      lng: Number,
    },

    destination: {
      address: String,
      lat: Number,
      lng: Number,
    },

    distanceMiles: {
      type: Number,
      required: true,
      min: 0,
    },

    durationMinutes: {
      type: Number,
      required: true,
      min: 0,
    },

    baseFare: {
      type: Number,
      default: 3.00,
    },

    perMileRate: {
      type: Number,
      default: 1.75,
    },

    perMinuteRate: {
      type: Number,
      default: 0.35,
    },

    estimatedFare: {
      type: Number,
      required: true,
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

    status: {
      type: String,
      enum: [
        'REQUESTED',
        'ACCEPTED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ],
      default: 'REQUESTED',
    },

    paymentStatus: {
      type: String,
      enum: [
        'PENDING',
        'AUTHORIZED',
        'CAPTURED',
        'FAILED',
        'REFUNDED',
      ],
      default: 'PENDING',
    },

    paymentAuthorizationId: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Ride ||
  mongoose.model('Ride', rideSchema);

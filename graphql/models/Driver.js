const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'SUSPENDED', 'DENIED'],
      default: 'PENDING',
    },

    zipCode: {
      type: String,
      default: '',
    },

    denialReason: {
      type: String,
      default: '',
    },

    online: {
      type: Boolean,
      default: false,
    },

    vehicleMake: String,
    vehicleModel: String,
    vehicleYear: Number,
    vehicleColor: String,
    licensePlate: String,

    currentLocation: {
      lat: Number,
      lng: Number,
    },

    totalEarnings: {
      type: Number,
      default: 0,
    },

    completedRides: {
      type: Number,
      default: 0,
    },

    rating: {
      type: Number,
      default: 5,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Driver ||
  mongoose.model('Driver', driverSchema);

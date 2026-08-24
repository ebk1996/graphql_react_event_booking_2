const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const driverSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  phone: { type: String, default: '' },

  vehicleMake: { type: String, required: true },
  vehicleModel: { type: String, required: true },
  vehicleColor: { type: String, required: true },
  vehicleYear: { type: Number, required: true },
  licensePlate: { type: String, required: true },

  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'DENIED'],
    default: 'PENDING',
    index: true,
  },

  vehicleStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'DENIED'],
    default: 'PENDING',
  },

  online: {
    type: Boolean,
    default: false,
  },

  completedRides: {
    type: Number,
    default: 0,
  },

  totalEarnings: {
    type: Number,
    default: 0,
  },

  rating: {
    type: Number,
    default: 5,
  },

  deniedReason: {
    type: String,
    default: '',
  },

  vehicleDeniedReason: {
    type: String,
    default: '',
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

driverSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Driver', driverSchema);

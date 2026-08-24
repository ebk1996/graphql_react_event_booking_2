const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const driverApplicationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied'],
      default: 'pending',
    },
    vehicleStatus: {
      type: String,
      enum: ['pending', 'approved', 'denied'],
      default: 'pending',
    },
    vehicleMake: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleModel: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleYear: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleColor: {
      type: String,
      default: '',
      trim: true,
    },
    licensePlate: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DriverApplication', driverApplicationSchema);

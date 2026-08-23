const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
  type: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  booking: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  event: {
    type: Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);

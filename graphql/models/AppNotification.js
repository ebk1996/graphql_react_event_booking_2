const mongoose = require('mongoose');

const appNotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    type: {
      type: String,
      enum: [
        'FOLLOW',
        'UNFOLLOW',
        'LIKE',
        'COMMENT',
        'MESSAGE',
        'RIDE_REQUEST',
        'RIDE_ACCEPTED',
        'RIDE_ARRIVING',
        'RIDE_COMPLETED',
        'PAYMENT',
        'SYSTEM',
      ],
      required: true,
    },

    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.AppNotification ||
  mongoose.model('AppNotification', appNotificationSchema);

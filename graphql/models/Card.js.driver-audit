const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    provider: {
      type: String,
      required: true,
    },

    providerCustomerId: {
      type: String,
      default: '',
    },

    providerPaymentMethodId: {
      type: String,
      required: true,
    },

    brand: {
      type: String,
      default: '',
    },

    last4: {
      type: String,
      default: '',
      maxlength: 4,
    },

    expirationMonth: {
      type: Number,
      default: null,
    },

    expirationYear: {
      type: Number,
      default: null,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.Card ||
  mongoose.model('Card', cardSchema);

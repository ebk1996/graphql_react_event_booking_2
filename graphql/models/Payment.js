const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        ride: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Ride',
            required: true,
            unique: true,
        },

        rider: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        authorizationId: String,

        paymentIntentId: {
            type: String,
            default: '',
        },

        stripeStatus: {
            type: String,
            default: '',
        },

        capturedAt: {
            type: Date,
            default: null,
        },

        amount: {
            type: Number,
            required: true,
        },

        driverAmount: {
            type: Number,
            required: true,
        },

        platformAmount: {
            type: Number,
            required: true,
        },

        status: {
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

        provider: {
            type: String,
            default: 'external-tokenized-provider',
        },
    },
    { timestamps: true },
);

module.exports =
    mongoose.models.Payment ||
    mongoose.model('Payment', paymentSchema);

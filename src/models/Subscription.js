const mongoose = require('mongoose');

const subscriptionSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Product', // <--- CRITICAL: Links to Product Collection
      },
      name: { type: String }, // Backup info
      quantity: { type: Number, required: true, default: 1 },
      price: { type: Number, required: true },
    },
  ],
  frequency: {
    type: String,
    required: true,
    enum: ['Weekly', 'Bi-Weekly', 'Monthly'],
    default: 'Monthly',
  },
  nextDeliveryDate: {
    type: Date,
  },
  // Only 'active' subscriptions are delivered by the scheduler
  status: {
    type: String,
    enum: ['active', 'paused'],
    default: 'active',
  },
  lastDeliveryDate: {
    type: Date,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
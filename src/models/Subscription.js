const mongoose = require('mongoose');

const subscriptionSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, required: true }
  }],
  frequency: { type: String, enum: ['Weekly', 'Bi-Weekly', 'Monthly'], default: 'Monthly' },
  nextDeliveryDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
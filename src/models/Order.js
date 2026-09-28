const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderItems: [{
    name: { type: String, required: true },
    qty: { type: Number, required: true },
    price: { type: Number, required: true }, // Unit price at the time of the order
    image: { type: String },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  }],
  // 'checkout' = placed from the cart, 'subscription' = created by the delivery scheduler
  source: { type: String, enum: ['checkout', 'subscription'], default: 'checkout' },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  totalPrice: { type: Number, required: true },
  paymentMethod: { type: String, default: 'Cash on Delivery' },
  shippingAddress: {
    address: { type: String },
    city: { type: String },
  },
  customerInfo: {
    name: { type: String },
    phone: { type: String },
    email: { type: String },
  },
  isPaid: { type: Boolean, default: false },
  paidAt: { type: Date },
  isDelivered: { type: Boolean, default: false },
  deliveredAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);

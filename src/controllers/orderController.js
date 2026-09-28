const Order = require('../models/Order');
const Cart = require('../models/Cart');
const { placeOrder, OrderError } = require('../services/orderService');

// @desc    Place an order from the cart. Prices, delivery fee and total are computed on the server.
// @route   POST /api/orders
const createOrder = async (req, res) => {
  const { orderItems, paymentMethod, shippingAddress = {}, customerInfo = {} } = req.body;

  if (!shippingAddress.address || !shippingAddress.city || !customerInfo.name || !customerInfo.phone) {
    return res.status(400).json({ message: 'Name, phone, address and city are required' });
  }

  try {
    const { order } = await placeOrder({
      userId: req.user._id,
      // Accept either { product, qty } (cart shape) or { productId, quantity }
      items: (orderItems || []).map((item) => ({
        productId: item.productId || item.product?._id || item.product,
        quantity: item.quantity ?? item.qty,
      })),
      source: 'checkout',
      paymentMethod,
      shippingAddress: { address: shippingAddress.address, city: shippingAddress.city },
      customerInfo: { name: customerInfo.name, phone: customerInfo.phone, email: customerInfo.email },
    });

    // The order now owns these items
    await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });

    res.status(201).json(order);
  } catch (error) {
    if (error instanceof OrderError) return res.status(error.status).json({ message: error.message });
    console.error('Create Order Error:', error);
    res.status(500).json({ message: 'Could not place the order' });
  }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
};

// @desc    All orders (admin)
// @route   GET /api/orders
const getAllOrders = async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 }).populate('user', 'name email');
  res.json(orders);
};

// @desc    Mark an order delivered (admin). Cash on delivery orders are paid on delivery.
// @route   PUT /api/orders/:id/deliver
const markDelivered = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const now = new Date();
    order.isDelivered = true;
    order.deliveredAt = now;
    if (!order.isPaid) {
      order.isPaid = true;
      order.paidAt = now;
    }
    await order.save();
    await order.populate('user', 'name email');
    res.json(order);
  } catch (error) {
    res.status(404).json({ message: 'Order not found' });
  }
};

module.exports = { createOrder, getMyOrders, getAllOrders, markDelivered };

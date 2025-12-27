const Order = require('../models/Order');
const PantryItem = require('../models/PantryItem'); // <--- Import this
const Product = require('../models/Product');       // <--- Import this

// @desc    Create new order AND add items to Pantry
// @route   POST /api/orders
const createOrder = async (req, res) => {
  const { orderItems, totalPrice } = req.body;

  if (orderItems && orderItems.length === 0) {
    res.status(400);
    throw new Error('No order items');
  } else {
    // 1. Create the Transaction Record (The Order)
    const order = new Order({
      user: req.user._id,
      orderItems,
      totalPrice,
      isPaid: true, // Assuming instant payment for this project
      isDelivered: false,
    });

    const createdOrder = await order.save();

    // 2. THE FIX: Automatically Add Items to User's Pantry
    // We loop through everything they just bought
    for (const item of orderItems) {
        // Fetch the original product to get the 'shelfLifeDays'
        // (because the cart might not have that info)
        const product = await Product.findById(item.product);

        if (product) {
            // Calculate the Expiry Date
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + product.shelfLifeDays);

            // Save to Pantry Collection
            await PantryItem.create({
                user: req.user._id,
                product: item.product,
                name: item.name, // e.g. "Milk"
                shelfLifeDays: product.shelfLifeDays,
                expiryDate: expiryDate,
                status: 'Fresh'
            });
        }
    }

    res.status(201).json(createdOrder);
  }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
};

module.exports = { createOrder, getMyOrders };
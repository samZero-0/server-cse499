const Order = require('../models/Order');
const PantryItem = require('../models/PantryItem');
const Product = require('../models/Product');

// @desc    Create new order AND add items to Pantry (Debug Version)
// @route   POST /api/orders
const createOrder = async (req, res) => {
  const { orderItems, totalPrice } = req.body;

  console.log("--- STARTING ORDER CREATION ---");
  console.log("Received Items:", JSON.stringify(orderItems, null, 2));

  if (orderItems && orderItems.length === 0) {
    res.status(400);
    throw new Error('No order items');
  } else {
    try {
      // 1. Create the Transaction Record (The Order)
      const order = new Order({
        user: req.user._id,
        orderItems,
        totalPrice,
        isPaid: true, 
        isDelivered: false,
      });

      const createdOrder = await order.save();
      console.log("Order Saved:", createdOrder._id);

      // 2. ADD TO PANTRY
      for (const item of orderItems) {
          // Normalize ID (Handle both populated object and raw string)
          const productId = item.product._id ? item.product._id.toString() : item.product.toString();
          const productName = item.name || "Unknown Item";

          console.log(`Processing Pantry Item: ${productName} (ID: ${productId})`);

          // Try to find the product to get fresh details
          const product = await Product.findById(productId);

          let shelfLifeDays = 14; // Default if not found
          
          if (product) {
              shelfLifeDays = product.shelfLifeDays || 14;
              console.log(`-> Found Product in DB. Shelf Life: ${shelfLifeDays} days`);
          } else {
              console.log(`-> WARNING: Product ${productId} NOT found in DB. Using default shelf life.`);
          }

          // Calculate Expiry
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + shelfLifeDays);

          // Create Pantry Item (Even if product lookup failed, we use the Order data)
          await PantryItem.create({
              user: req.user._id,
              product: productId,
              name: productName, 
              shelfLifeDays: shelfLifeDays,
              expiryDate: expiryDate,
              status: 'Fresh'
          });
          console.log(`-> Added to Pantry: ${productName}`);
      }

      console.log("--- ORDER COMPLETE ---");
      res.status(201).json(createdOrder);

    } catch (error) {
      console.error("CRITICAL ORDER ERROR:", error);
      res.status(500).json({ message: "Order processed but failed to update Pantry" });
    }
  }
};

// @desc    Get logged in user orders
const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
};

module.exports = { createOrder, getMyOrders };
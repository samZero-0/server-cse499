const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const PantryItem = require('../models/PantryItem');
const Subscription = require('../models/Subscription');

// @desc    Get Dashboard Stats (Dynamic based on Role)
// @route   GET /api/stats
const getStats = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      // --- ADMIN STATS ---
      const totalUsers = await User.countDocuments();
      const totalProducts = await Product.countDocuments();
      const totalOrders = await Order.countDocuments();

      // Calculate Total Revenue
      const revenueAgg = await Order.aggregate([
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]);
      const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

      // Get 5 Most Recent Orders
      const recentOrders = await Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email');

      res.json({
        role: 'admin',
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
        recentOrders
      });

    } else {
      // --- USER STATS ---
      // 1. Total Spent
      const orders = await Order.find({ user: req.user._id });
      const totalSpent = orders.reduce((acc, order) => acc + order.totalPrice, 0);

      // 2. Pantry Count
      const pantryCount = await PantryItem.countDocuments({ user: req.user._id });

      // 3. Subscription Status
      const subscription = await Subscription.findOne({ user: req.user._id });

      // 4. "What has been purchased" (Category Breakdown Estimate)
      // Note: A real implementation would aggregate this via MongoDB. 
      // For now, we mock the savings as 5% of total spent (Loyalty Logic)
      const estimatedSavings = Math.floor(totalSpent * 0.05);

      res.json({
        role: 'user',
        totalSpent,
        pantryCount,
        nextDelivery: subscription ? subscription.nextDeliveryDate : null,
        savings: estimatedSavings,
        recentOrders: orders.slice(0, 5) // Last 5 orders
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getStats };
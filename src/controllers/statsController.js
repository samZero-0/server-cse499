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

      // Revenue = money actually collected (cash on delivery orders are paid on delivery)
      const revenueAgg = await Order.aggregate([
        { $match: { isPaid: true } },
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
      const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
      const totalSpent = orders.reduce((acc, order) => acc + order.totalPrice, 0);
      // Real savings: subscription discounts recorded on each order
      const savings = orders.reduce((acc, order) => acc + (order.discount || 0), 0);

      // Pantry items that still have units left (older items without a quantity count as 1)
      const pantryCount = await PantryItem.countDocuments({
        user: req.user._id,
        $or: [{ quantity: { $gt: 0 } }, { quantity: { $exists: false } }],
      });

      const subscription = await Subscription.findOne({ user: req.user._id });
      const hasActiveSubscription = Boolean(subscription && subscription.status === 'active' && subscription.items.length > 0);

      res.json({
        role: 'user',
        totalSpent,
        pantryCount,
        savings,
        subscriptionStatus: subscription ? (subscription.items.length ? subscription.status : 'empty') : 'none',
        nextDelivery: hasActiveSubscription ? subscription.nextDeliveryDate : null,
        recentOrders: orders.slice(0, 5)
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getStats };
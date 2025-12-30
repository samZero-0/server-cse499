const Subscription = require('../models/Subscription');

// @desc    Get User Subscription (Populated with Product Images)
// @route   GET /api/subscription
const getSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id })
      .populate('items.product'); // <--- CRITICAL: Fetches Image/Details from Product

    if (subscription) {
      res.json(subscription);
    } else {
      res.status(404).json({ message: 'No active subscription found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update Subscription (Manual Bundle Builder)
// @route   POST /api/subscription
const updateSubscription = async (req, res) => {
  const { items, frequency } = req.body;

  try {
    let subscription = await Subscription.findOne({ user: req.user._id });

    if (subscription) {
      // Update existing
      subscription.items = items;
      subscription.frequency = frequency || subscription.frequency;
      
      // Calculate next delivery (Simple logic)
      const now = new Date();
      if (frequency === 'Weekly') now.setDate(now.getDate() + 7);
      else if (frequency === 'Bi-Weekly') now.setDate(now.getDate() + 14);
      else now.setMonth(now.getMonth() + 1);
      subscription.nextDeliveryDate = now;

      const updatedSubscription = await subscription.save();
      // Re-populate to return full data
      await updatedSubscription.populate('items.product'); 
      res.json(updatedSubscription);
    } else {
      // Create new
      const now = new Date();
      now.setMonth(now.getMonth() + 1); // Default next month

      const newSubscription = await Subscription.create({
        user: req.user._id,
        items,
        frequency: frequency || 'Monthly',
        nextDeliveryDate: now
      });
      await newSubscription.populate('items.product');
      res.json(newSubscription);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = { getSubscription, updateSubscription };
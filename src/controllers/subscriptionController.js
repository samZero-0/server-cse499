const Subscription = require('../models/Subscription');

// @desc Get user subscription
// @route GET /api/subscription
const getSubscription = async (req, res) => {
  const sub = await Subscription.findOne({ user: req.user._id }).populate('items.product');
  res.json(sub);
};

// @desc Create or Update subscription
// @route POST /api/subscription
const updateSubscription = async (req, res) => {
  const { items, frequency } = req.body;
  
  // Calculate next delivery based on frequency
  const nextDate = new Date();
  if (frequency === 'Weekly') nextDate.setDate(nextDate.getDate() + 7);
  else if (frequency === 'Bi-Weekly') nextDate.setDate(nextDate.getDate() + 14);
  else nextDate.setDate(nextDate.getDate() + 30);

  let sub = await Subscription.findOne({ user: req.user._id });

  if (sub) {
    sub.items = items;
    sub.frequency = frequency;
    sub.nextDeliveryDate = nextDate; // Reset date on update or keep logic
    const updatedSub = await sub.save();
    res.json(updatedSub);
  } else {
    const newSub = await Subscription.create({
      user: req.user._id,
      items,
      frequency,
      nextDeliveryDate: nextDate
    });
    res.status(201).json(newSub);
  }
};

module.exports = { getSubscription, updateSubscription };
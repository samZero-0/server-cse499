const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const { FREQUENCIES, nextDeliveryDate } = require('../utils/pricing');

const populated = (sub) => sub.populate('items.product');

// @desc    Get User Subscription (Populated with Product Images)
// @route   GET /api/subscription
const getSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id }).populate('items.product');

    if (subscription) {
      res.json(subscription);
    } else {
      res.status(404).json({ message: 'No active subscription found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Save the bundle (items + frequency). Names and prices come from the product catalog.
// @route   POST /api/subscription
const updateSubscription = async (req, res) => {
  const { items = [], frequency = 'Monthly' } = req.body;

  if (!FREQUENCIES.includes(frequency)) {
    return res.status(400).json({ message: `Frequency must be one of: ${FREQUENCIES.join(', ')}` });
  }

  try {
    const ids = items.map((i) => i.product?._id || i.product || i.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: ids } });
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    const cleanItems = [];
    for (const item of items) {
      const product = byId.get(String(item.product?._id || item.product || item.productId));
      const quantity = parseInt(item.quantity, 10);
      if (!product || !(quantity >= 1)) continue;
      const existing = cleanItems.find((i) => i.product.equals(product._id));
      if (existing) existing.quantity += quantity;
      else cleanItems.push({ product: product._id, name: product.name, price: product.price, quantity });
    }

    let subscription = await Subscription.findOne({ user: req.user._id });
    const now = new Date();

    if (!subscription) {
      subscription = new Subscription({
        user: req.user._id,
        items: cleanItems,
        frequency,
        status: 'active',
        nextDeliveryDate: nextDeliveryDate(frequency, now),
      });
    } else {
      const frequencyChanged = subscription.frequency !== frequency;
      subscription.items = cleanItems;
      subscription.frequency = frequency;
      // Keep the scheduled date unless the rhythm changed or the date is missing/past
      if (frequencyChanged || !subscription.nextDeliveryDate || subscription.nextDeliveryDate < now) {
        subscription.nextDeliveryDate = nextDeliveryDate(frequency, now);
      }
    }

    await subscription.save();
    res.json(await populated(subscription));
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Skip the next delivery (moves it forward by one cycle)
// @route   POST /api/subscription/skip
const skipNextDelivery = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });
    if (!subscription) return res.status(404).json({ message: 'No subscription found' });

    const now = new Date();
    const base = subscription.nextDeliveryDate && subscription.nextDeliveryDate > now ? subscription.nextDeliveryDate : now;
    subscription.nextDeliveryDate = nextDeliveryDate(subscription.frequency, base);
    await subscription.save();
    res.json(await populated(subscription));
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Pause or resume deliveries
// @route   PUT /api/subscription/status   body: { status: 'active' | 'paused' }
const setSubscriptionStatus = async (req, res) => {
  const { status } = req.body;
  if (!['active', 'paused'].includes(status)) {
    return res.status(400).json({ message: "Status must be 'active' or 'paused'" });
  }

  try {
    const subscription = await Subscription.findOne({ user: req.user._id });
    if (!subscription) return res.status(404).json({ message: 'No subscription found' });

    subscription.status = status;
    // Resuming after the scheduled date has passed restarts the cycle from today
    if (status === 'active' && (!subscription.nextDeliveryDate || subscription.nextDeliveryDate < new Date())) {
      subscription.nextDeliveryDate = nextDeliveryDate(subscription.frequency);
    }
    await subscription.save();
    res.json(await populated(subscription));
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = { getSubscription, updateSubscription, skipNextDelivery, setSubscriptionStatus };

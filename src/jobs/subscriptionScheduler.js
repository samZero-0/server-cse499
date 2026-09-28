const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { placeOrder } = require('../services/orderService');
const { nextDeliveryDate } = require('../utils/pricing');

/**
 * Turn every active subscription that is due into an order (15% off, free delivery),
 * add it to the pantry, and schedule the next delivery.
 */
const processDueSubscriptions = async (now = new Date()) => {
  const due = await Subscription.find({
    status: 'active',
    nextDeliveryDate: { $lte: now },
    'items.0': { $exists: true },
  });

  const results = [];
  for (const sub of due) {
    try {
      const user = await User.findById(sub.user);
      const { order, skipped } = await placeOrder({
        userId: sub.user,
        items: sub.items.map((item) => ({ productId: item.product, quantity: item.quantity })),
        source: 'subscription',
        shippingAddress: { address: user?.address, city: user?.city },
        customerInfo: { name: user?.name, phone: user?.phone, email: user?.email },
        skipUnavailable: true,
      });
      sub.lastDeliveryDate = now;
      results.push({ subscription: sub._id, order: order._id, skipped });
      console.log(`Subscription ${sub._id}: created order ${order._id}${skipped.length ? `, skipped ${skipped.length} item(s)` : ''}`);
    } catch (error) {
      // e.g. everything out of stock: nothing to deliver this cycle
      results.push({ subscription: sub._id, error: error.message });
      console.error(`Subscription ${sub._id}: ${error.message}`);
    }

    sub.nextDeliveryDate = nextDeliveryDate(sub.frequency, now);
    await sub.save();
  }
  return results;
};

const runScheduler = () => {
  // Every day at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('Running Subscription Scheduler...');
    processDueSubscriptions().catch((error) => console.error('Subscription Scheduler failed:', error));
  });
};

module.exports = runScheduler;
module.exports.processDueSubscriptions = processDueSubscriptions;

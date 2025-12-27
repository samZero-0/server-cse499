const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const Order = require('../models/Order');

const runScheduler = () => {
  // Run every day at midnight (00:00)
  cron.schedule('0 0 * * *', async () => {
    console.log('Running Subscription Scheduler...');
    
    const today = new Date();
    
    // Find active subscriptions where nextDeliveryDate <= today
    const dueSubscriptions = await Subscription.find({
      isActive: true,
      nextDeliveryDate: { $lte: today }
    }).populate('items.product');

    for (const sub of dueSubscriptions) {
      // 1. Create an Order automatically
      const orderItems = sub.items.map(item => ({
        name: item.product.name,
        qty: item.quantity,
        price: item.product.price,
        product: item.product._id
      }));

      const totalPrice = orderItems.reduce((acc, item) => acc + item.price * item.qty, 0);

      await Order.create({
        user: sub.user,
        orderItems,
        totalPrice,
        isPaid: false, // In real app, trigger auto-charge here
        isDelivered: false
      });

      // 2. Update Next Delivery Date
      const nextDate = new Date();
      if (sub.frequency === 'Weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (sub.frequency === 'Bi-Weekly') nextDate.setDate(nextDate.getDate() + 14);
      else nextDate.setDate(nextDate.getDate() + 30);

      sub.nextDeliveryDate = nextDate;
      await sub.save();
      
      console.log(`Processed subscription for user ${sub.user}`);
    }
  });
};

module.exports = runScheduler;
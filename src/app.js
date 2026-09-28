const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const pantryRoutes = require('./routes/pantryRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const orderRoutes = require('./routes/orderRoutes');
const statsRoutes = require('./routes/statsRoutes');
const app = express();
const userRoutes = require('./routes/userRoutes');
const aiRoutes = require('./routes/aiRoutes');
const cartRoutes = require('./routes/cartRoutes');
// Middleware
app.use(cors({
  origin: ["https://paltrypal.vercel.app", "http://localhost:3000"],  // Allow only your frontend
  credentials: true
}));
app.use(express.json()); // Allows parsing JSON body
app.use(morgan('dev')); // Logger

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/pantry', pantryRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/cart', cartRoutes);
// Daily subscription deliveries when deployed on Vercel (serverless, so node-cron never fires there).
// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project env.
app.get('/api/cron/subscriptions', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ message: 'Not authorized' });
  }
  try {
    const { processDueSubscriptions } = require('./jobs/subscriptionScheduler');
    const results = await processDueSubscriptions();
    res.json({ processed: results.length, results });
  } catch (error) {
    console.error('Cron subscriptions failed:', error);
    res.status(500).json({ message: 'Subscription run failed' });
  }
});

// Base Route
app.get('/', (req, res) => {
  res.send('PantryPal API is running...');
});

module.exports = app;
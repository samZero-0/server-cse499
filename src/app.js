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
  origin: 'http://localhost:3000', // Allow only your frontend
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
// Base Route
app.get('/', (req, res) => {
  res.send('PantryPal API is running...');
});

module.exports = app;
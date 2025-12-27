const dotenv = require('dotenv');
const connectDB = require('./src/config/db');
const app = require('./src/app');
const runScheduler = require('./src/jobs/subscriptionScheduler');

// Load env vars
dotenv.config();

// Connect to Database
connectDB();

// Start Background Jobs
runScheduler();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
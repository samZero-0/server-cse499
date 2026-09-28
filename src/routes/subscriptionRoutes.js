const express = require('express');
const router = express.Router();
const {
  getSubscription,
  updateSubscription,
  skipNextDelivery,
  setSubscriptionStatus,
} = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getSubscription)
  .post(protect, updateSubscription);
router.post('/skip', protect, skipNextDelivery);
router.put('/status', protect, setSubscriptionStatus);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getSubscription, updateSubscription } = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getSubscription)
  .post(protect, updateSubscription);

module.exports = router;
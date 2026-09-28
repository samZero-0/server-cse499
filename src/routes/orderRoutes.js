const express = require('express');
const router = express.Router();
const { createOrder, getMyOrders, getAllOrders, markDelivered } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');

router.route('/').post(protect, createOrder).get(protect, admin, getAllOrders);
router.route('/myorders').get(protect, getMyOrders);
router.route('/:id/deliver').put(protect, admin, markDelivered);

module.exports = router;

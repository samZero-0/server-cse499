const express = require('express');
const router = express.Router();
const { getCart, addToCart, clearCart, removeCartItem,updateCartItem } = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

// All cart routes are protected
router.route('/')
  .get(protect, getCart)
  .post(protect, addToCart)
  .delete(protect, clearCart);

  router.route('/:id')
  .put(protect, updateCartItem)
  .delete(protect, removeCartItem);

module.exports = router;
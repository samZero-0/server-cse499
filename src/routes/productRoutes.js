const express = require('express');
const router = express.Router();
const { getProducts, createProduct, createBulkProducts, getProductById } = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');

// const { admin } = require('../middleware/adminMiddleware');

// router.route('/').get(getProducts).post(protect, admin, createProduct);

router.route('/').get(getProducts).post(protect, createProduct);
router.route('/bulk').post(createBulkProducts);
router.route('/:id').get(getProductById);
module.exports = router;
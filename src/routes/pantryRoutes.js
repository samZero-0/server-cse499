const express = require('express');
const router = express.Router();
const { getPantry, addToPantry } = require('../controllers/pantryController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getPantry).post(protect, addToPantry);

module.exports = router;
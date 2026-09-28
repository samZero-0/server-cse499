const express = require('express');
const router = express.Router();
const { getPantry, addToPantry, consumePantryItem, deletePantryItem } = require('../controllers/pantryController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getPantry).post(protect, addToPantry);
router.route('/:id').delete(protect, deletePantryItem);
router.route('/:id/consume').patch(protect, consumePantryItem);

module.exports = router;

const PantryItem = require('../models/PantryItem');
const Product = require('../models/Product');

// @desc Get user pantry items
// @route GET /api/pantry
const getPantry = async (req, res) => {
  const items = await PantryItem.find({ user: req.user._id });
  res.json(items);
};

// @desc Add item to pantry manually
// @route POST /api/pantry
const addToPantry = async (req, res) => {
  const { productId } = req.body;
  const product = await Product.findById(productId);

  if (product) {
    // Logic: Calculate Expiry
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + product.shelfLifeDays);

    const pantryItem = await PantryItem.create({
      user: req.user._id,
      product: product._id,
      name: product.name,
      shelfLifeDays: product.shelfLifeDays,
      expiryDate: expiryDate
    });
    res.status(201).json(pantryItem);
  } else {
    res.status(404).json({ message: 'Product not found' });
  }
};

module.exports = { getPantry, addToPantry };
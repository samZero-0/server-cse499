const PantryItem = require('../models/PantryItem');
const Product = require('../models/Product');

// @desc    Get user pantry items
// @route   GET /api/pantry
const getPantry = async (req, res) => {
  try {
    // Because we fixed the DB, 'product' now has the real image and price!
    const items = await PantryItem.find({ user: req.user._id })
      .populate('product') 
      .sort({ expiryDate: 1 });

    res.json(items);
  } catch (error) {
    console.error("Pantry Fetch Error:", error);
    res.status(500).json({ message: "Failed to load pantry items" });
  }
};

// @desc    Add item to pantry manually
// @route   POST /api/pantry
const addToPantry = async (req, res) => {
  const { productId, customShelfLife } = req.body;

  try {
    const product = await Product.findById(productId);

    if (product) {
      // Use custom days if provided, otherwise database default
      const daysToAdd = customShelfLife || product.shelfLifeDays || 14;
      
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(daysToAdd));

      const pantryItem = await PantryItem.create({
        user: req.user._id,
        product: product._id,
        name: product.name,
        shelfLifeDays: daysToAdd,
        expiryDate: expiryDate
      });

      // Populate immediately so Frontend gets the image right away
      await pantryItem.populate('product');
      
      res.status(201).json(pantryItem);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getPantry, addToPantry };
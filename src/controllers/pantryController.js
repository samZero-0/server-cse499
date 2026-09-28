const PantryItem = require('../models/PantryItem');
const Product = require('../models/Product');

// @desc    Get user pantry items (only ones with units left)
// @route   GET /api/pantry
const getPantry = async (req, res) => {
  try {
    // Items saved before quantities were tracked have no quantity field; they count as 1 unit
    const items = await PantryItem.find({
      user: req.user._id,
      $or: [{ quantity: { $gt: 0 } }, { quantity: { $exists: false } }],
    })
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
  const { productId, customShelfLife, quantity = 1 } = req.body;

  try {
    const product = await Product.findById(productId);

    if (product) {
      // Use custom days if provided, otherwise database default
      const daysToAdd = parseInt(customShelfLife || product.shelfLifeDays || 14, 10);

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysToAdd);

      const pantryItem = await PantryItem.create({
        user: req.user._id,
        product: product._id,
        name: product.name,
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        price: product.price,
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

// @desc    Use up units of a pantry item. Removes it when none are left.
// @route   PATCH /api/pantry/:id/consume   body: { amount?: number }
const consumePantryItem = async (req, res) => {
  try {
    const item = await PantryItem.findOne({ _id: req.params.id, user: req.user._id });
    if (!item) return res.status(404).json({ message: 'Pantry item not found' });

    const amount = Math.max(1, parseInt(req.body?.amount, 10) || 1);
    const remaining = Math.max(0, (item.quantity ?? 1) - amount);

    if (remaining === 0) {
      await item.deleteOne();
      return res.json({ _id: item._id, quantity: 0, removed: true });
    }

    item.quantity = remaining;
    await item.save();
    await item.populate('product');
    res.json(item);
  } catch (error) {
    res.status(404).json({ message: 'Pantry item not found' });
  }
};

// @desc    Remove a pantry item entirely (thrown away or no longer tracked)
// @route   DELETE /api/pantry/:id
const deletePantryItem = async (req, res) => {
  try {
    const result = await PantryItem.deleteOne({ _id: req.params.id, user: req.user._id });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Pantry item not found' });
    res.json({ _id: req.params.id, removed: true });
  } catch (error) {
    res.status(404).json({ message: 'Pantry item not found' });
  }
};

module.exports = { getPantry, addToPantry, consumePantryItem, deletePantryItem };

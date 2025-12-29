const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Get Cart (AI & User Sync)
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart) return res.json({ items: [] });

    // Filter out null products (in case a product was deleted)
    cart.items = cart.items.filter(item => item.product);
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cart' });
  }
};

// @desc    Add Item
const addToCart = async (req, res) => {
  const { productId, quantity } = req.body;
  try {
    const product = await Product.findById(productId);
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

    const itemIndex = cart.items.findIndex(p => p.product.toString() === productId);

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
    } else {
      cart.items.push({
        product: productId,
        name: product.name,
        quantity: quantity,
        price: product.price,
        image: product.imageUrl
      });
    }
    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Error adding to cart' });
  }
};

// @desc    Update Quantity (+ / -)
const updateCartItem = async (req, res) => {
  const { id } = req.params; // Item ID (Product ID)
  const { quantity } = req.body;

  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const itemIndex = cart.items.findIndex(p => p.product.toString() === id);

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
      await cart.save();
      return res.json(cart);
    }
    res.status(404).json({ message: 'Item not found in cart' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating cart' });
  }
};

// @desc    Remove Item (Trash Can)
const removeCartItem = async (req, res) => {
  const { id } = req.params;

  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    cart.items = cart.items.filter(p => p.product.toString() !== id);
    
    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Error removing item' });
  }
};

// @desc    Clear Cart
const clearCart = async (req, res) => {
  await Cart.findOneAndDelete({ user: req.user._id });
  res.json({ message: 'Cart cleared' });
};

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, clearCart };
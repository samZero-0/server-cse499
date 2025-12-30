const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Get Cart (AI & User Sync)
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    
    if (!cart) {
      return res.json({ items: [] });
    }

    // Filter out null products
    cart.items = cart.items.filter(item => item.product != null);
    
    res.json(cart);
  } catch (error) {
    console.error("Get Cart Error:", error);
    res.status(500).json({ message: 'Error fetching cart' });
  }
};

// @desc    Add Item
const addToCart = async (req, res) => {
  const { productId, quantity } = req.body;
  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    // Check if product already exists in cart
    const itemIndex = cart.items.findIndex(p => {
        const dbId = p.product._id ? p.product._id.toString() : p.product.toString();
        return dbId === productId;
    });

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
    console.error("Add Cart Error:", error);
    res.status(500).json({ message: 'Error adding to cart' });
  }
};

// @desc    Update Quantity (+ / -)
// FIX: Checks both Product ID and Cart Item ID
const updateCartItem = async (req, res) => {
  const { id } = req.params; // Can be Product ID OR Cart Item ID
  const { quantity } = req.body;

  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    // FIX: Match either Product ID OR the specific Item Subdocument ID
    const itemIndex = cart.items.findIndex(p => {
        const productId = p.product._id ? p.product._id.toString() : p.product.toString();
        const itemId = p._id.toString(); 
        return productId === id || itemId === id;
    });

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
      await cart.save();
      return res.json(cart);
    }
    
    res.status(404).json({ message: 'Item not found in cart' });
  } catch (error) {
    console.error("Update Cart Error:", error);
    res.status(500).json({ message: 'Error updating cart' });
  }
};

// @desc    Remove Item
// FIX: Checks both Product ID and Cart Item ID
const removeCartItem = async (req, res) => {
  const { id } = req.params; // Can be Product ID OR Cart Item ID

  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const originalLength = cart.items.length;

    // FIX: Filter out if matches EITHER Product ID OR Item ID
    cart.items = cart.items.filter(item => {
      const productId = item.product && item.product._id 
          ? item.product._id.toString() 
          : item.product.toString();
      const itemId = item._id.toString();

      // Keep item only if ID matches NEITHER
      return productId !== id && itemId !== id;
    });

    if (cart.items.length < originalLength) {
        await cart.save();
    }
    
    res.json(cart);
  } catch (error) {
    console.error("Remove Item Error:", error);
    res.status(500).json({ message: 'Error removing item' });
  }
};

// @desc    Clear Cart
const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
        cart.items = [];
        await cart.save();
    }
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    res.status(500).json({ message: 'Error clearing cart' });
  }
};

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, clearCart };
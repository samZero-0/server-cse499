const Product = require('../models/Product');

// @desc Fetch all products
// @route GET /api/products
const getProducts = async (req, res) => {
  const products = await Product.find({});
  res.json(products);
};

// @desc Create a product (Admin)
// @route POST /api/products
const createProduct = async (req, res) => {
  // Destructure imageUrl from the body
  const { name, category, price, stock, shelfLifeDays, description, imageUrl } = req.body;

  const product = new Product({
    name, 
    category, 
    price, 
    stock, 
    shelfLifeDays, 
    description,
    imageUrl // <--- Save it here
  });

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
};
const createBulkProducts = async (req, res) => {
  try {
    // 1. Expect an ARRAY of products in the body
    const products = req.body; 

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: 'Please send an array of products' });
    }

    // 2. Insert them all
    const createdProducts = await Product.insertMany(products);
    
    res.status(201).json({
      message: `Successfully added ${createdProducts.length} products`,
      data: createdProducts
    });
  } catch (error) {
    res.status(500).json({ message: 'Bulk import failed', error: error.message });
  }
};
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(404).json({ message: 'Product not found' });
  }
};

module.exports = { getProducts, createProduct, createBulkProducts, getProductById };
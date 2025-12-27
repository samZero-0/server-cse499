const mongoose = require('mongoose');

const productSchema = mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true, default: 0 },
  shelfLifeDays: { type: Number, required: true },
  description: { type: String },
  // MATCH THE JSON KEY EXACTLY:
  imageUrl: { 
      type: String, 
      default: 'https://placehold.co/600x400?text=No+Image' // Fallback image
  }, 
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
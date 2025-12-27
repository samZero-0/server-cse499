const mongoose = require('mongoose');

const pantryItemSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true }, // Snapshot of name
  shelfLifeDays: { type: Number, required: true }, // Snapshot of shelf life
  purchaseDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  status: { type: String, enum: ['Fresh', 'Expiring Soon', 'Expired'], default: 'Fresh' }
}, { timestamps: true });

module.exports = mongoose.model('PantryItem', pantryItemSchema);
const Order = require('../models/Order');
const Product = require('../models/Product');
const PantryItem = require('../models/PantryItem');
const { SUBSCRIPTION_DISCOUNT, deliveryFeeFor } = require('../utils/pricing');

const PAYMENT_METHODS = ['Cash on Delivery'];

class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Merge duplicate product lines and validate quantities
const normalizeItems = (items) => {
  const merged = new Map();
  for (const item of items || []) {
    const productId = String(item.productId || '');
    const qty = Number(item.quantity);
    if (!productId || !Number.isInteger(qty) || qty < 1) {
      throw new OrderError(400, 'Each item needs a product and a whole-number quantity of at least 1');
    }
    merged.set(productId, (merged.get(productId) || 0) + qty);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

const releaseStock = (reserved) =>
  Promise.all(reserved.map((r) => Product.updateOne({ _id: r.productId }, { $inc: { stock: r.quantity } })));

/**
 * Create an order priced from the database, reserve stock and add the items to the user's pantry.
 *
 * items: [{ productId, quantity }]
 * source: 'checkout' (delivery fee rules apply) or 'subscription' (15% off, free delivery)
 * skipUnavailable: order what is available instead of failing (used by the subscription scheduler)
 */
const placeOrder = async ({
  userId,
  items,
  source = 'checkout',
  paymentMethod = 'Cash on Delivery',
  shippingAddress = {},
  customerInfo = {},
  skipUnavailable = false,
}) => {
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new OrderError(400, `Unsupported payment method. Available: ${PAYMENT_METHODS.join(', ')}`);
  }

  const requested = normalizeItems(items);
  if (requested.length === 0) throw new OrderError(400, 'Your order has no items');

  const products = await Product.find({ _id: { $in: requested.map((r) => r.productId) } }).catch(() => {
    throw new OrderError(400, 'One or more product ids are invalid');
  });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  // Reserve stock line by line; roll back everything if a required line fails
  const reserved = [];
  const skipped = [];
  for (const line of requested) {
    const product = byId.get(line.productId);
    if (!product) {
      if (skipUnavailable) {
        skipped.push({ productId: line.productId, reason: 'no longer sold' });
        continue;
      }
      await releaseStock(reserved);
      throw new OrderError(400, 'An item in your order is no longer available');
    }

    const updated = await Product.findOneAndUpdate(
      { _id: product._id, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } },
      { new: true }
    );
    if (!updated) {
      if (skipUnavailable) {
        skipped.push({ productId: line.productId, name: product.name, reason: 'not enough stock' });
        continue;
      }
      await releaseStock(reserved);
      throw new OrderError(
        409,
        product.stock > 0
          ? `Only ${product.stock} of ${product.name} left in stock`
          : `${product.name} is out of stock`
      );
    }
    reserved.push({ ...line, product });
  }

  if (reserved.length === 0) {
    throw new OrderError(409, 'None of these items are in stock right now');
  }

  const isSubscription = source === 'subscription';
  const subtotal = reserved.reduce((sum, r) => sum + r.product.price * r.quantity, 0);
  const discount = isSubscription ? Math.round(subtotal * SUBSCRIPTION_DISCOUNT) : 0;
  const deliveryFee = isSubscription ? 0 : deliveryFeeFor(subtotal);
  const totalPrice = subtotal - discount + deliveryFee;

  let order;
  try {
    order = await Order.create({
      user: userId,
      source,
      orderItems: reserved.map((r) => ({
        product: r.product._id,
        name: r.product.name,
        qty: r.quantity,
        price: r.product.price,
        image: r.product.imageUrl,
      })),
      subtotal,
      discount,
      deliveryFee,
      totalPrice,
      paymentMethod,
      shippingAddress,
      customerInfo,
      isPaid: false, // Cash on delivery: marked paid when delivered
      isDelivered: false,
    });
  } catch (error) {
    await releaseStock(reserved);
    throw error;
  }

  // Everything bought is tracked in the pantry from the day it is ordered
  const now = new Date();
  await PantryItem.insertMany(
    reserved.map((r) => {
      const shelfLifeDays = r.product.shelfLifeDays || 14;
      const expiryDate = new Date(now);
      expiryDate.setDate(expiryDate.getDate() + shelfLifeDays);
      return {
        user: userId,
        product: r.product._id,
        order: order._id,
        name: r.product.name,
        quantity: r.quantity,
        price: isSubscription ? Math.round(r.product.price * (1 - SUBSCRIPTION_DISCOUNT)) : r.product.price,
        shelfLifeDays,
        purchaseDate: now,
        expiryDate,
      };
    })
  );

  return { order, skipped };
};

module.exports = { placeOrder, OrderError, PAYMENT_METHODS };

// Tools the shopping assistant can call. Every tool acts only on the signed-in user's data
// and goes through the same rules as the rest of the API (catalog prices, stock limits).
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const PantryItem = require('../models/PantryItem');
const Subscription = require('../models/Subscription');
const {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  SUBSCRIPTION_DISCOUNT,
  FREQUENCIES,
  nextDeliveryDate,
  deliveryFeeFor,
} = require('../utils/pricing');

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: { type: 'object', properties, required, additionalProperties: false },
  },
});

const productId = { type: 'string', description: 'Product id returned by search_products' };
const quantity = { type: 'integer', minimum: 1, description: 'Number of units' };

const toolDefinitions = [
  fn(
    'search_products',
    'Search the store catalog. Always use this to find product ids, prices and stock before adding anything.',
    {
      query: { type: 'string', description: 'Words to match in product names, e.g. "milk" or "brown bread"' },
      category: { type: ['string', 'null'], description: 'Optional category filter, e.g. "Dairy"' },
    },
    ['query']
  ),
  fn('view_cart', "Show the user's cart with quantities, prices, subtotal and delivery fee."),
  fn('add_to_cart', 'Add units of a product to the cart.', { product_id: productId, quantity }, ['product_id', 'quantity']),
  fn(
    'set_cart_quantity',
    'Set the exact quantity of a product already in the cart. Use 0 to remove it.',
    { product_id: productId, quantity: { type: 'integer', minimum: 0 } },
    ['product_id', 'quantity']
  ),
  fn('clear_cart', 'Remove everything from the cart. Only when the user clearly asks to empty it.'),
  fn('open_checkout', 'Open the checkout form so the user can confirm their address and place the order (cash on delivery).'),
  fn(
    'view_pantry',
    "List what is in the user's pantry with days until each item expires. Use for recipe ideas or 'what should I use first'.",
    { expiring_only: { type: ['boolean', 'null'], description: 'Only items expiring within 3 days or already expired' } }
  ),
  fn('view_subscription', "Show the user's recurring delivery bundle, frequency, status and next delivery date."),
  fn(
    'add_to_subscription',
    'Add units of a product to the recurring subscription bundle (15% off, free delivery).',
    { product_id: productId, quantity },
    ['product_id', 'quantity']
  ),
  fn('remove_from_subscription', 'Remove a product from the subscription bundle.', { product_id: productId }, ['product_id']),
  fn(
    'set_subscription_frequency',
    'Change how often the subscription is delivered.',
    { frequency: { type: 'string', enum: FREQUENCIES } },
    ['frequency']
  ),
  fn('skip_next_delivery', 'Skip the next subscription delivery; it moves one cycle later.'),
  fn(
    'set_subscription_status',
    'Pause or resume subscription deliveries.',
    { status: { type: 'string', enum: ['active', 'paused'] } },
    ['status']
  ),
];

// ---------------------------------------------------------------- helpers

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

const findProduct = async (id) => {
  try {
    return await Product.findById(id);
  } catch {
    return null;
  }
};

const summarizeCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate('items.product');
  const items = (cart?.items || [])
    .filter((i) => i.product)
    .map((i) => ({
      product_id: i.product._id.toString(),
      name: i.product.name,
      unit_price: i.product.price,
      quantity: i.quantity,
      line_total: i.product.price * i.quantity,
    }));
  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  const delivery_fee = items.length ? deliveryFeeFor(subtotal) : 0;
  return { items, subtotal, delivery_fee, total: subtotal + delivery_fee, currency: 'BDT (৳)' };
};

const summarizeSubscription = (sub) => {
  if (!sub) return { exists: false, message: 'No subscription yet. Adding an item creates one (monthly by default).' };
  const items = sub.items
    .filter((i) => i.product)
    .map((i) => ({
      product_id: (i.product._id || i.product).toString(),
      name: i.product.name || i.name,
      unit_price: i.product.price ?? i.price,
      quantity: i.quantity,
    }));
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const discount = Math.round(subtotal * SUBSCRIPTION_DISCOUNT);
  return {
    exists: true,
    status: sub.status,
    frequency: sub.frequency,
    next_delivery: sub.status === 'active' && items.length ? day(sub.nextDeliveryDate) : null,
    items,
    per_delivery: { subtotal, discount, delivery_fee: 0, total: subtotal - discount },
  };
};

const loadSubscription = (userId) => Subscription.findOne({ user: userId }).populate('items.product');

const getOrCreateSubscription = async (userId) => {
  let sub = await Subscription.findOne({ user: userId });
  if (!sub) {
    sub = new Subscription({
      user: userId,
      items: [],
      frequency: 'Monthly',
      status: 'active',
      nextDeliveryDate: nextDeliveryDate('Monthly'),
    });
  }
  return sub;
};

// ---------------------------------------------------------------- executors
// Each returns plain JSON for the model. `effects` records what changed so the UI can refresh.

const executors = {
  async search_products({ query = '', category }) {
    const words = query.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
    const filter = {};
    if (words.length) filter.$and = words.map((w) => ({ name: { $regex: w, $options: 'i' } }));
    if (category) filter.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };

    let products = await Product.find(filter).limit(8);
    // Fall back to matching any word (e.g. "eggs" vs "Farm Eggs (12 pcs)")
    if (!products.length && words.length) {
      products = await Product.find({ $or: words.map((w) => ({ name: { $regex: w.replace(/s$/i, ''), $options: 'i' } })) }).limit(8);
    }
    return {
      results: products.map((p) => ({
        product_id: p._id.toString(),
        name: p.name,
        category: p.category,
        price: p.price,
        in_stock: p.stock,
        shelf_life_days: p.shelfLifeDays,
      })),
    };
  },

  async view_cart(_, { userId }) {
    return summarizeCart(userId);
  },

  async add_to_cart({ product_id, quantity: qty }, { userId, effects }) {
    const product = await findProduct(product_id);
    if (!product) return { error: 'Unknown product_id. Use search_products first.' };
    const units = Math.max(1, parseInt(qty, 10) || 1);

    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = await Cart.create({ user: userId, items: [] });
    const line = cart.items.find((i) => i.product.toString() === product._id.toString());
    const inCart = line ? line.quantity : 0;
    if (inCart + units > product.stock) {
      return { error: `Only ${Math.max(0, product.stock - inCart)} more ${product.name} can be added (stock ${product.stock}, ${inCart} already in cart).` };
    }
    if (line) {
      line.quantity += units;
      line.price = product.price;
    } else {
      cart.items.push({ product: product._id, name: product.name, quantity: units, price: product.price, image: product.imageUrl });
    }
    await cart.save();
    effects.cartChanged = true;
    return { added: { name: product.name, quantity: units }, cart: await summarizeCart(userId) };
  },

  async set_cart_quantity({ product_id, quantity: qty }, { userId, effects }) {
    const cart = await Cart.findOne({ user: userId });
    const line = cart?.items.find((i) => i.product.toString() === String(product_id));
    if (!line) return { error: 'That product is not in the cart.' };
    const units = Math.max(0, parseInt(qty, 10) || 0);
    if (units === 0) {
      cart.items = cart.items.filter((i) => i !== line);
    } else {
      const product = await findProduct(product_id);
      if (!product) return { error: 'Product no longer exists.' };
      if (units > product.stock) return { error: `Only ${product.stock} ${product.name} in stock.` };
      line.quantity = units;
      line.price = product.price;
    }
    await cart.save();
    effects.cartChanged = true;
    return { cart: await summarizeCart(userId) };
  },

  async clear_cart(_, { userId, effects }) {
    await Cart.updateOne({ user: userId }, { $set: { items: [] } });
    effects.cartChanged = true;
    return { cleared: true };
  },

  async open_checkout(_, { userId, effects }) {
    const cart = await summarizeCart(userId);
    if (!cart.items.length) return { error: 'The cart is empty, so there is nothing to check out.' };
    effects.openCheckout = true;
    return { opened: true, total: cart.total, payment: 'Cash on delivery' };
  },

  async view_pantry({ expiring_only }, { userId }) {
    const items = await PantryItem.find({
      user: userId,
      $or: [{ quantity: { $gt: 0 } }, { quantity: { $exists: false } }],
    }).sort({ expiryDate: 1 });
    const now = Date.now();
    const list = items
      .map((i) => ({
        name: i.name,
        quantity: i.quantity ?? 1,
        days_until_expiry: Math.floor((new Date(i.expiryDate) - now) / 86400000),
        use_by: day(i.expiryDate),
      }))
      .filter((i) => !expiring_only || i.days_until_expiry <= 3);
    return { items: list };
  },

  async view_subscription(_, { userId }) {
    return summarizeSubscription(await loadSubscription(userId));
  },

  async add_to_subscription({ product_id, quantity: qty }, { userId, effects }) {
    const product = await findProduct(product_id);
    if (!product) return { error: 'Unknown product_id. Use search_products first.' };
    const units = Math.max(1, parseInt(qty, 10) || 1);
    const sub = await getOrCreateSubscription(userId);
    const line = sub.items.find((i) => i.product.toString() === product._id.toString());
    if (line) line.quantity += units;
    else sub.items.push({ product: product._id, name: product.name, price: product.price, quantity: units });
    if (!sub.nextDeliveryDate) sub.nextDeliveryDate = nextDeliveryDate(sub.frequency);
    await sub.save();
    effects.subscriptionChanged = true;
    return summarizeSubscription(await loadSubscription(userId));
  },

  async remove_from_subscription({ product_id }, { userId, effects }) {
    const sub = await Subscription.findOne({ user: userId });
    const before = sub?.items.length || 0;
    if (!sub) return { error: 'There is no subscription.' };
    sub.items = sub.items.filter((i) => i.product.toString() !== String(product_id));
    if (sub.items.length === before) return { error: 'That product is not in the subscription.' };
    await sub.save();
    effects.subscriptionChanged = true;
    return summarizeSubscription(await loadSubscription(userId));
  },

  async set_subscription_frequency({ frequency }, { userId, effects }) {
    if (!FREQUENCIES.includes(frequency)) return { error: `Frequency must be one of ${FREQUENCIES.join(', ')}` };
    const sub = await Subscription.findOne({ user: userId });
    if (!sub) return { error: 'There is no subscription yet. Add an item first.' };
    if (sub.frequency !== frequency) {
      sub.frequency = frequency;
      sub.nextDeliveryDate = nextDeliveryDate(frequency);
      await sub.save();
      effects.subscriptionChanged = true;
    }
    return summarizeSubscription(await loadSubscription(userId));
  },

  async skip_next_delivery(_, { userId, effects }) {
    const sub = await Subscription.findOne({ user: userId });
    if (!sub) return { error: 'There is no subscription.' };
    if (sub.status !== 'active') return { error: 'Deliveries are paused, so there is nothing to skip.' };
    const now = new Date();
    const base = sub.nextDeliveryDate && sub.nextDeliveryDate > now ? sub.nextDeliveryDate : now;
    sub.nextDeliveryDate = nextDeliveryDate(sub.frequency, base);
    await sub.save();
    effects.subscriptionChanged = true;
    return summarizeSubscription(await loadSubscription(userId));
  },

  async set_subscription_status({ status }, { userId, effects }) {
    if (!['active', 'paused'].includes(status)) return { error: "Status must be 'active' or 'paused'" };
    const sub = await Subscription.findOne({ user: userId });
    if (!sub) return { error: 'There is no subscription.' };
    sub.status = status;
    if (status === 'active' && (!sub.nextDeliveryDate || sub.nextDeliveryDate < new Date())) {
      sub.nextDeliveryDate = nextDeliveryDate(sub.frequency);
    }
    await sub.save();
    effects.subscriptionChanged = true;
    return summarizeSubscription(await loadSubscription(userId));
  },
};

const runTool = async (name, args, context) => {
  const executor = executors[name];
  if (!executor) return { error: `Unknown tool ${name}` };
  try {
    return await executor(args || {}, context);
  } catch (error) {
    console.error(`AI tool ${name} failed:`, error);
    return { error: 'That action failed on the server.' };
  }
};

const storePolicies = `Store rules (BDT, shown as ৳):
- Delivery: free on orders of ৳${FREE_DELIVERY_THRESHOLD} or more, otherwise ৳${DELIVERY_FEE}.
- Payment: cash on delivery only.
- Subscriptions: ${Math.round(SUBSCRIPTION_DISCOUNT * 100)}% off and free delivery on every delivery; frequencies ${FREQUENCIES.join(', ')}; can be skipped or paused.
- Everything ordered is added to the user's pantry with a use-by date based on shelf life.`;

module.exports = { toolDefinitions, runTool, storePolicies };

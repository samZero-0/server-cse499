// Single source of truth for pricing rules. The client mirrors these for display only;
// the server always recomputes totals from the database.

const DELIVERY_FEE = 60;
const FREE_DELIVERY_THRESHOLD = 500; // Checkout orders at or above this subtotal ship free
const SUBSCRIPTION_DISCOUNT = 0.15; // Applied to every subscription delivery (which also ships free)

const FREQUENCIES = ['Weekly', 'Bi-Weekly', 'Monthly'];

// Next delivery date after `from` for a subscription frequency
const nextDeliveryDate = (frequency, from = new Date()) => {
  const date = new Date(from);
  if (frequency === 'Weekly') date.setDate(date.getDate() + 7);
  else if (frequency === 'Bi-Weekly') date.setDate(date.getDate() + 14);
  else date.setMonth(date.getMonth() + 1);
  return date;
};

// Delivery fee for a regular checkout subtotal
const deliveryFeeFor = (subtotal) => (subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE);

module.exports = {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  SUBSCRIPTION_DISCOUNT,
  FREQUENCIES,
  nextDeliveryDate,
  deliveryFeeFor,
};

const MARGINS = {
  mrp: 1.25,
  msp: 1.4,
};

// Flat shipping fee applied to every ONLINE (self-checkout) order,
// regardless of payment method (COD or Razorpay). Walk-in/in-store orders
// never carry this — the customer already has the product in hand.
const SHIPPING_FEE = 100;

function round2(num) {
  return Math.round(num * 100) / 100;
}

function calculateMrp(costPrice) {
  if (costPrice === undefined || costPrice === null) return undefined;
  return round2(costPrice * MARGINS.mrp);
}

function calculateMsp(costPrice) {
  if (costPrice === undefined || costPrice === null) return undefined;
  return round2(costPrice * MARGINS.msp);
}

module.exports = { MARGINS, SHIPPING_FEE, calculateMrp, calculateMsp };
const Coupon = require("../models/Coupon");

// Shared by both online checkout and walk-in orders — one validation
// path so the rules can never drift between the two.
async function validateAndApplyCoupon(code, orderItems, itemsTotal) {
  if (!code) return { coupon: null, discountAmount: 0 };

  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
  if (!coupon) {
    throw Object.assign(new Error("Invalid coupon code"), { statusCode: 400 });
  }
  if (!coupon.isActive) {
    throw Object.assign(new Error("This coupon is no longer active"), { statusCode: 400 });
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw Object.assign(new Error("This coupon has expired"), { statusCode: 400 });
  }
  if (coupon.usageLimit !== undefined && coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw Object.assign(new Error("This coupon has reached its usage limit"), { statusCode: 400 });
  }
  if (itemsTotal < coupon.minOrderValue) {
    throw Object.assign(
      new Error(`This coupon requires a minimum order of ₹${coupon.minOrderValue}`),
      { statusCode: 400 }
    );
  }

  // Aggregate floor: the combined MSP across every line item — a coupon
  // can never push the order's total below this, no matter how generous
  // the code is. Items whose MSP is still at its default (above MRP, i.e.
  // never manually lowered) contribute zero headroom here, which is the
  // intended effect — MSP being manually lowered is what makes an item
  // genuinely eligible for discounting.
  const mspFloorTotal = orderItems.reduce((sum, item) => sum + (item.mspPrice ?? item.price) * item.quantity, 0);
  const maxAllowedDiscount = Math.max(0, itemsTotal - mspFloorTotal);

  const requestedDiscount =
    coupon.discountType === "fixed" ? coupon.value : Math.round((itemsTotal * coupon.value) / 100);

  const discountAmount = Math.min(requestedDiscount, maxAllowedDiscount, itemsTotal);

  return { coupon, discountAmount };
}

module.exports = { validateAndApplyCoupon };
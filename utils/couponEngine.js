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

// POST /api/coupons/preview — read-only. Same rules as real checkout
// (reuses validateAndApplyCoupon directly), but never increments
// usageCount. Powers the Price Check tool, where nothing gets saved.
async function previewCoupon(req, res, next) {
  try {
    const { code, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items to check" });
    }

    const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    // Shape items exactly like buildOrderItemsAndDeductStock's output, since
    // validateAndApplyCoupon reads .mspPrice/.price/.quantity off each line.
    const { coupon, discountAmount } = await validateAndApplyCoupon(code, items, itemsTotal);

    res.json({
      valid: true,
      discountAmount,
      code: coupon ? coupon.code : null,
    });
  } catch (err) {
    // validateAndApplyCoupon throws with statusCode for expected rejections
    // (expired, limit reached, etc.) — surface those as a normal 400, not
    // a 500 crash, since this is exactly the kind of thing staff need to
    // see clearly in a quick price-check tool.
    if (err.statusCode) {
      return res.status(err.statusCode).json({ valid: false, message: err.message });
    }
    next(err);
  }
}

module.exports = { validateAndApplyCoupon, previewCoupon };
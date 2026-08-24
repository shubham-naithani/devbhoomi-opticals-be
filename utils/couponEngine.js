const Coupon = require("../models/Coupon");
const User = require("../models/User");
const PointsLedger = require("../models/PointsLedger");

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

// Call this right where usageCount gets incremented (i.e. only once a coupon has
// actually discounted a real, saved order) — same session/transaction, so crediting
// points can never happen without the order existing, or vice versa.
//
// Referrer earns referralPercent of what the order actually collected (totalAmount,
// after the referral coupon's own discount) rather than the pre-discount total —
// a cut of real revenue, not of a discount that was never paid. If you intended the
// percentage to be based on the pre-discount total instead, change `order.totalAmount`
// below to whatever pre-discount subtotal your order object carries.
async function creditReferralPoints(coupon, order, session) {
  if (!coupon.isReferral || !coupon.referrerUser) return;

  const percent = coupon.referralPercent ?? 0;
  if (percent <= 0) return;

  const pointsEarned = Math.round((order.totalAmount * percent) / 100);
  if (pointsEarned <= 0) return;

  await User.updateOne({ _id: coupon.referrerUser }, { $inc: { pointsBalance: pointsEarned } }, { session });

  await PointsLedger.create(
    [
      {
        user: coupon.referrerUser,
        type: "earned",
        amount: pointsEarned,
        order: order._id,
        coupon: coupon._id,
        note: `Referral reward — ${coupon.code} used on order ${order.orderId}`,
      },
    ],
    { session }
  );
}

// Pure calculation, no DB writes — lets the caller work out the order's final
// total (and therefore create the Order document) BEFORE anything about the
// redemption actually gets written. Clamped twice: never more than the
// customer's real balance, and never more than what's still owed after any
// coupon/item discounts already applied — so a redemption can never push the
// order below ₹0 or spend points the customer doesn't have.
function clampPointsRedemption(customer, requestedPoints, remainingTotal) {
  const requested = Math.max(Math.round(Number(requestedPoints) || 0), 0);
  if (requested <= 0) return 0;
  const available = customer.pointsBalance || 0;
  return Math.min(requested, available, Math.floor(remainingTotal));
}

// Writes the actual redemption — call this only after the order it's being
// redeemed against already exists and is saved (same session/transaction),
// mirroring creditReferralPoints's "never mutate points without a real
// saved order" rule. `pointsRedeemed` should already be the clamped value
// from clampPointsRedemption — this function trusts it and just applies it.
async function redeemPoints(customerId, pointsRedeemed, order, session) {
  if (!pointsRedeemed || pointsRedeemed <= 0) return;

  await User.updateOne({ _id: customerId }, { $inc: { pointsBalance: -pointsRedeemed } }, { session });

  await PointsLedger.create(
    [
      {
        user: customerId,
        type: "redeemed",
        amount: pointsRedeemed,
        order: order._id,
        note: `Redeemed ${pointsRedeemed} points on order ${order.orderId}`,
      },
    ],
    { session }
  );
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

module.exports = {
  validateAndApplyCoupon,
  previewCoupon,
  creditReferralPoints,
  clampPointsRedemption,
  redeemPoints,
};

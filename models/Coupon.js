const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ["fixed", "percentage"], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
    usageLimit: { type: Number }, // undefined = unlimited
    usageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // --- Marketing campaign fields (new) ---
    // A coupon row is either a normal, manually-created coupon (isCampaignIssued: false, the default —
    // behaves exactly as before, shows up in the regular Coupons list) or a one-time code auto-generated
    // for a single recipient by a marketing send (isCampaignIssued: true). Both flow through the exact
    // same validateAndApplyCoupon() path at checkout — nothing about redemption logic changes.
    isCampaignIssued: { type: Boolean, default: false },
    campaignSourceCoupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" }, // the template coupon this was generated from
    recipientType: { type: String, enum: ["lead", "customer", "referral"] },
    recipientName: { type: String, trim: true },
    recipientPhone: { type: String, trim: true },
    recipientEmail: { type: String, trim: true },
    sentAt: { type: Date },
    whatsappStatus: { type: String, enum: ["queued", "sent", "failed"] },

    // --- Referral fields (new) ---
    // A referral coupon is generated on behalf of an existing customer (the referrer) and
    // handed to a friend outside the system — there's no tracked "recipient" the way a
    // campaign send has, since the friend isn't in our data yet. When this coupon actually
    // discounts an order (same validateAndApplyCoupon() path, unchanged), couponEngine's
    // creditReferralPoints() credits referrerUser with referralPercent of what that order
    // collected.
    isReferral: { type: Boolean, default: false },
    referrerUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    referralPercent: { type: Number, min: 0, max: 100 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);

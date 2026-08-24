const mongoose = require("mongoose");

// Audit trail for a customer's referral points — mirrors why the Marketing Logs tab
// exists instead of just trusting Coupon.usageCount: a stored balance alone can't answer
// "why does this customer have 340 points" months later, this can.
const pointsLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // whose balance this affects
    type: { type: String, enum: ["earned", "redeemed"], required: true },
    amount: { type: Number, required: true, min: 0 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" }, // earned: the friend's order; redeemed: the referrer's own order
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" }, // the referral coupon that triggered an "earned" entry
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PointsLedger", pointsLedgerSchema);

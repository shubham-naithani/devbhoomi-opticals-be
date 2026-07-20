const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    type: { type: String, enum: ["payment", "refund"], required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "card", "upi", "cod", "razorpay"], required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String },
  },
  { timestamps: true }
);

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ order: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
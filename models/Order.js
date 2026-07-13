const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },
    name: { type: String, required: true },     // snapshot, in case the product changes later
    price: { type: Number, required: true },     // snapshot of unit price at time of order
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
      required: true, // assigned via utils/humanId.js before creation
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "cash", "card", "upi"],
      default: "cod",
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "delivered", "cancelled"],
      default: "pending",
    },
    // Where the order originated — lets reporting split walk-in vs online sales.
    source: {
      type: String,
      enum: ["online", "in_store"],
      default: "online",
    },
    // Staff/admin member who created this order on the customer's behalf.
    // Null for a customer's own self-checkout order.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    prescriptionUsed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EyeTest",
    },
    shippingAddress: {
      type: String,
      trim: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

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
    // How much the customer has actually paid so far. For a full walk-in
    // payment this equals totalAmount; for an advance/deposit it's less.
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Derived from amountPaid vs totalAmount, but stored (not virtual) so it's
    // directly filterable/sortable in the admin orders list without a
    // client-side computation on every row.
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
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
    // Soft delete: the order (and the audit trail pointing at it) is kept
    // forever, it's just hidden from the normal list views. Deleting an
    // order also returns its items to stock (see orderController) — a
    // hard-deleted sale shouldn't leave inventory permanently short.
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Guards against double-restocking if an order is cancelled and then
    // later soft-deleted (or vice versa) — stock should only ever be
    // returned once per order.
    stockRestored: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Keep paymentStatus in sync with amountPaid whenever either is set/changed.
orderSchema.pre("save", function () {
  if (this.amountPaid <= 0) {
    this.paymentStatus = "unpaid";
  } else if (this.amountPaid >= this.totalAmount) {
    this.paymentStatus = "paid";
  } else {
    this.paymentStatus = "partial";
  }
});

module.exports = mongoose.model("Order", orderSchema);

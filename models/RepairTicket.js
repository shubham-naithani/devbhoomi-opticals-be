const mongoose = require("mongoose");

const repairTicketSchema = new mongoose.Schema(
  {
    repairId: {
      type: String,
      unique: true,
      required: true, // assigned via humanId.js, same pattern as orderId
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Snapshot of what's being repaired — kept even if the product is later
    // deleted/deactivated, same principle as Order.items snapshots.
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
    },
    articleId: mongoose.Schema.Types.ObjectId,
    itemName: { type: String, required: true }, // e.g. "Ray-Ban Aviator — Black"
    // Null when no matching past order was found for this customer — an
    // "unverified" repair ticket, still allowed but flagged for staff.
    linkedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    purchaseDate: Date, // snapshotted from the matched order — survives even if the order is later deleted
    warrantyMonths: { type: Number, default: 0 },
    isUnderWarranty: { type: Boolean, default: false }, // computed once at creation, not re-evaluated later
    isUnverified: { type: Boolean, default: false }, // true if no matching order/purchase was found
    feeAmount: { type: Number, default: 0, min: 0 },
    feeCollected: { type: Boolean, default: false },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "upi", "cod"],
    },
    issueDescription: { type: String, required: true, trim: true },
    staffNotes: { type: String, trim: true },
    status: {
      type: String,
      enum: ["received", "in_progress", "ready_for_pickup", "collected", "cancelled"],
      default: "received",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RepairTicket", repairTicketSchema);
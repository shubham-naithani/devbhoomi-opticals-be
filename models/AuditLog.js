const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["Order", "Inventory", "User", "EyeTest"],
      required: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: ["create", "update", "delete"],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    performedByName: String, // snapshot, in case the staff account is later deleted
    summary: String,         // short human-readable description, e.g. "Order ORD-2026-000123 status -> confirmed"
  },
  { timestamps: true }
);

auditLogSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);

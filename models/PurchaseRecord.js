const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema(
  {
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
    articleId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true }, // snapshot, e.g. "Ray-Ban Aviator — Black / Green lens"
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 }, // what was actually paid per unit on this invoice
  },
  { _id: false }
);

const purchaseRecordSchema = new mongoose.Schema(
  {
    purchaseId: { type: String, unique: true, required: true }, // e.g. PUR-2026-000001
    supplierName: { type: String, required: true, trim: true },
    invoiceNumber: { type: String, trim: true },
    invoiceDate: { type: Date, required: true },
    items: {
      type: [purchaseItemSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
    totalAmount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PurchaseRecord", purchaseRecordSchema);
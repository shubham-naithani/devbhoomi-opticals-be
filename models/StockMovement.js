const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
  {
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
    articleId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true }, // snapshot — readable even if the article is later deleted
    productName: { type: String, required: true }, // snapshot for the same reason
    type: {
      type: String,
      enum: ["sale", "restock_cancelled", "purchase_in", "manual_adjustment"],
      required: true,
    },
    quantityChange: { type: Number, required: true }, // negative for sale, positive for restock/purchase/manual increase
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    // Only meaningfully populated for manual_adjustment — the other three
    // types are already self-explanatory via referenceType/referenceId.
    reason: { type: String, trim: true },
    referenceType: { type: String, enum: ["Order", "PurchaseRecord", null], default: null },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

stockMovementSchema.index({ inventoryItem: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
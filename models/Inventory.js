const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
      default: "Unbranded",
    },
    category: {
      type: String,
      enum: ["eyeglasses", "sunglasses", "lens", "contact_lens", "accessory"],
      default: "eyeglasses",
    },
    frameType: {
      type: String, // rim style, e.g. full-rim, half-rim, rimless
      trim: true,
    },
    // Frame silhouette — independent of rim style (frameType) and brand.
    // Kept as a fixed enum (rather than free text) so it stays usable as a
    // reliable filter — free-text fields drift ("Aviator" vs "aviator" vs
    // "Avaitor") in a way that breaks filtering over time.
    frameShape: {
      type: String,
      enum: [
        "aviator",
        "wayfarer",
        "round",
        "square",
        "rectangle",
        "cat_eye",
        "oval",
        "geometric",
        "other",
      ],
    },
    gender: {
      type: String,
      enum: ["men", "women", "unisex", "kids"],
      default: "unisex",
    },
    // What the store pays the supplier — never shown to customers, used for
    // margin/profit reporting. Optional so existing/quick entries don't break.
    costPrice: {
      type: Number,
      min: 0,
    },
    // MRP — what the customer pays. Kept as `price` (not renamed to `mrp`)
    // since every existing order/cart/catalog reference already treats this
    // field as the selling price; renaming would only add churn for no
    // functional gain.
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    // A frame can have several photos (front, side, on-model, etc).
    // Each entry is a full URL pointing at Azure Blob Storage.
    images: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

inventorySchema.index({ name: "text", brand: "text" });

module.exports = mongoose.model("Inventory", inventorySchema);

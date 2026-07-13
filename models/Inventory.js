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
      type: String, // e.g. full-rim, half-rim, rimless
      trim: true,
    },
    gender: {
      type: String,
      enum: ["men", "women", "unisex", "kids"],
      default: "unisex",
    },
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
    imageUrl: {
      type: String,
      trim: true,
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

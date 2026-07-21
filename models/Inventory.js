const mongoose = require("mongoose");

// An "article" is one actually-sellable variant of a product — a specific
// color/lens-tint/size combination, with its own stock, price, SKU, and
// photos. "Ray-Ban Aviator" is the Product; "Black frame, green lens" and
// "Gold frame, brown lens" are two Articles under it.
const articleSchema = new mongoose.Schema({
  sku: {
    type: String,
    trim: true,
  },
  // Distinct from SKU — SKU is a human-facing catalog code, barcode is what
  // a physical scanner reads off a printed tag. Immutable at the schema
  // level: once a barcode is printed onto a tag, it can never be reassigned
  // to a different article without invalidating tags already on the shelf.
  barcode: {
    type: String,
    trim: true,
    immutable: true,
  },
  barcodeGeneratedAt: {
    type: Date,
    immutable: true,
  },
  color: { type: String, trim: true },
  lensTint: { type: String, trim: true },
  size: { type: String, trim: true },
  // What the store pays the supplier — never shown to customers.
  costPrice: {
    type: Number,
    min: 0,
  },
  // MSP — server-computed as costPrice × 1.40 by default, but staff can
  // manually override it (e.g. a negotiated minimum for a specific
  // variant). isMspManual tracks whether that override is in effect, so a
  // later cost change knows whether to recalculate this or leave it alone.
  mspPrice: {
    type: Number,
    min: 0,
  },
  isMspManual: {
    type: Boolean,
    default: false,
  },
  // MRP — what the customer pays. Can genuinely differ between articles of
  // the same product (e.g., a gold frame costing more than black).
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
  lowStockThreshold: {
    type: Number,
    min: 0,
  },
  images: {
    type: [String],
    default: [],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// SKUs must be unique across every article, in every product — this index
// on the nested array field enforces that at the database level.
articleSchema.index({ sku: 1 }, { unique: true, sparse: true });
// Sparse + unique: fast exact-match lookup for the scan workflow, and
// guarantees no two articles can ever share a barcode — while still
// allowing existing articles (created before this feature) to have no
// barcode at all without violating the unique constraint.
articleSchema.index({ barcode: 1 }, { unique: true, sparse: true });

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
    description: {
      type: String,
      trim: true,
    },
    // Product-level visibility switch — hides every article at once
    // (e.g., a discontinued model), independent of each article's own
    // isActive flag (used for a single out-of-production color/size).
    isActive: {
      type: Boolean,
      default: true,
    },
    articles: {
      type: [articleSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A product needs at least one article (variant)",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Inventory", inventorySchema);

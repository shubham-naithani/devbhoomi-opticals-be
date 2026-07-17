const mongoose = require("mongoose");

// Deliberately minimal — just a curated name list so brands can exist in
// the autocomplete before any product uses them. No category/frame
// mapping here; those stay computed from real product data (see
// getBrandDefaults), keeping this separate from the deferred Configuration
// module.
const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Brand name is required"],
      trim: true,
      unique: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Brand", brandSchema);
const mongoose = require("mongoose");

// A "New Customer" from the Marketing screen — someone uploaded via Excel who hasn't
// placed an order yet. Once they place their first order they show up in the Existing
// Customers tab (derived from Orders) instead; nothing here needs to migrate them, the
// two tabs just query different sources.
const leadSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    email: { type: String, trim: true },
    uploadBatchId: { type: String }, // groups leads that came from the same Excel upload, for auditing
    source: { type: String, default: "excel_upload" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lead", leadSchema);

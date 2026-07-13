const mongoose = require("mongoose");

// One document per counter name, e.g. { _id: "order-2026", seq: 42 }
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);

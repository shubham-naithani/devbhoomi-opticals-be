const mongoose = require("mongoose");

const errorLogSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ["backend", "frontend"], required: true },
    // "critical" = unexpected server failure (5xx, uncaught exception) —
    // triggers a WhatsApp alert. "warning" = logged for visibility but
    // doesn't page anyone (reserved for future use, e.g. explicitly
    // flagged non-urgent issues).
    severity: { type: String, enum: ["critical", "warning"], default: "critical" },
    message: { type: String, required: true },
    stack: { type: String },
    route: { type: String },
    method: { type: String },
    statusCode: { type: Number },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

errorLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ErrorLog", errorLogSchema);
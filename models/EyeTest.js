const mongoose = require("mongoose");

const eyeSchema = new mongoose.Schema(
  {
    sphere: Number,
    cylinder: Number,
    axis: Number,
    add: Number,
  },
  { _id: false }
);

const eyeTestSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rightEye: { type: eyeSchema, default: {} },
    leftEye: { type: eyeSchema, default: {} },
    pupillaryDistance: Number, // PD, in mm
    testedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    testedAt: {
      type: Date,
      default: Date.now,
    },
    nextCheckupDue: Date,
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

eyeTestSchema.index({ customer: 1, testedAt: -1 });

module.exports = mongoose.model("EyeTest", eyeTestSchema);

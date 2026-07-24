const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "Home" }, // e.g. Home, Office, Other
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, required: true, trim: true },
    phone: { type: String, trim: true }, // contact number for this specific address, optional
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    // Optional now — walk-in customers created in-store often won't give an
    // email. Sparse + unique means the uniqueness rule only applies to
    // documents that actually have an email set.
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    // Phone is the primary lookup key for in-store customer search.
    // Sparse + unique: still allows creating admin/staff accounts without a
    // phone if ever needed, but prevents two customer records silently
    // duplicating the same number.
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    address: {
      type: String,
      trim: true,
    },
    addresses: {
      type: [addressSchema],
      default: [],
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    // True for accounts that can actually log in to the web app (have a
    // real, customer-chosen password). Walk-in customers created by staff
    // start as false — they exist as records, not logins, until they choose
    // to set a password themselves (a "claim your account" flow is a good
    // later addition, not built yet).
    canLogin: {
      type: Boolean,
      default: true,
    },
    role: {
      type: String,
      enum: ["admin", "staff", "customer"],
      default: "customer",
    },
    // Where this account originated — useful for reporting walk-in vs online growth.
    source: {
      type: String,
      enum: ["online", "in_store"],
      default: "online",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Hash password before saving, only if it was changed
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// If created with no password at all (walk-in, no-login customer), fill in
// an unusable random hash so the field is never blank, and mark canLogin false.
userSchema.pre("validate", function () {
  if (!this.password) {
    this.password = crypto.randomBytes(32).toString("hex");
    this.canLogin = false;
  }
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Never leak password hash even if the field is accidentally populated
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);

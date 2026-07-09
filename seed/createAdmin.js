// One-time helper to create the first admin account.
// Usage: node seed/createAdmin.js
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const User = require("../models/User");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = process.env.SEED_ADMIN_EMAIL || "admin@devbhoomiopticals.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
  } else {
    await User.create({
      name: "Store Admin",
      email,
      password,
      role: "admin",
    });
    console.log(`Admin created -> email: ${email} | password: ${password}`);
    console.log("Log in and change this password immediately.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

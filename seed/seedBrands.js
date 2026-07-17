/**
 * One-time (or repeatable) seed: pre-populates known brand names so the
 * inventory autocomplete has suggestions before any product exists for
 * them. Safe to re-run — skips brands that already exist.
 *
 * Usage: node seed/seedBrands.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Brand = require("../models/Brand");

// Edit this list to whatever brands sir wants pre-loaded.
const BRANDS = [
  "Ray-Ban",
  "Oakley",
  "Fastrack",
  "Titan Eye+",
  "Vincent Chase",
  "John Jacobs",
  "Lenskart Air",
  "Woodland",
  "Police",
  "Polaroid",
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected. Seeding brands...");

  let created = 0;
  for (const name of BRANDS) {
    const existing = await Brand.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
    if (!existing) {
      await Brand.create({ name });
      created++;
      console.log(`Added: ${name}`);
    } else {
      console.log(`Skipped (already exists): ${name}`);
    }
  }

  console.log(`Done. ${created} new brand(s) added.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
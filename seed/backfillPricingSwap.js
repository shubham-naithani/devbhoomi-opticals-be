require("dotenv").config();
const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");
const { calculateMrp, calculateMsp } = require("../utils/pricing");

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected. Recalculating pricing under the new MRP/MSP formulas...");

  const products = await Inventory.find({});
  let updated = 0;

  for (const product of products) {
    let changed = false;
    for (const article of product.articles) {
      if (article.costPrice === undefined || article.costPrice === null) continue;

      article.price = calculateMrp(article.costPrice);
      article.mspPrice = calculateMsp(article.costPrice);
      article.isMrpManual = false;
      changed = true;
    }
    if (changed) {
      await product.save();
      updated++;
    }
  }

  console.log(`Done. ${updated} product(s) recalculated under new pricing rules.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
/**
 * One-time backfill: creates a "payment" Transaction for any existing order
 * whose amountPaid isn't yet backed by a matching Transaction record.
 *
 * Safe to re-run — it only tops up the gap between an order's amountPaid
 * and what's already logged for it, so running this twice does nothing the
 * second time.
 *
 * Usage: node seed/backfillTransactions.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Transaction = require("../models/Transaction");

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected. Scanning orders...");

  const orders = await Order.find({ amountPaid: { $gt: 0 } });
  let created = 0;

  for (const order of orders) {
    const existing = await Transaction.aggregate([
      { $match: { order: order._id, type: "payment" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const alreadyLogged = existing[0]?.total || 0;
    const gap = order.amountPaid - alreadyLogged;

    if (gap > 0) {
      await Transaction.create({
        order: order._id,
        type: "payment",
        amount: gap,
        method: order.paymentMethod,
        performedBy: order.createdBy || order.customer,
        note: `Backfilled — payment predates ledger (order ${order.orderId})`,
        createdAt: order.createdAt, // preserve the real date so period buckets stay accurate
      });
      created++;
      console.log(`Backfilled ₹${gap} for ${order.orderId}`);
    }
  }

  console.log(`Done. ${created} backfill transaction(s) created.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
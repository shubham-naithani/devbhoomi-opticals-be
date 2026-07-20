const Transaction = require("../models/Transaction");

// Single source of truth for recording a money movement. Used by
// orderController (walk-in payments, refunds) and paymentController
// (Razorpay payments) alike — one ledger-writing function, not two
// slightly-different copies that could drift apart.
async function logTransaction({ orderId, type, amount, method, performedBy, note }, session) {
  const docs = await Transaction.create(
    [{ order: orderId, type, amount, method, performedBy, note }],
    session ? { session } : {}
  );
  return docs[0];
}

module.exports = { logTransaction };
const Counter = require("../models/Counter");

/**
 * Atomically increments and returns the next number for a given counter name.
 * Safe under concurrency — two requests hitting this at the same instant will
 * never receive the same number, because findOneAndUpdate + $inc is atomic
 * at the MongoDB level (unlike "count documents, then +1").
 */
async function getNextSequence(counterName) {
  const counter = await Counter.findByIdAndUpdate(
    counterName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

function pad(num, size) {
  return String(num).padStart(size, "0");
}

// e.g. ORD-2026-000123 — resets numbering per calendar year, easy to scan/report on
async function generateOrderId() {
  const year = new Date().getFullYear();
  const seq = await getNextSequence(`order-${year}`);
  return `ORD-${year}-${pad(seq, 6)}`;
}

const CATEGORY_PREFIX = {
  eyeglasses: "EYG",
  sunglasses: "SUN",
  lens: "LNS",
  contact_lens: "CTL",
  accessory: "ACC",
};

// e.g. EYG-000045 — category-prefixed, continuous sequence (not reset yearly)
async function generateInventorySku(category) {
  const prefix = CATEGORY_PREFIX[category] || "INV";
  const seq = await getNextSequence(`inventory-${prefix}`);
  return `${prefix}-${pad(seq, 6)}`;
}

// e.g. 89-00000012345 — Code128-compatible numeric string, not a
// GS1-registered EAN. "89" is just a fixed marker prefix distinguishing
// self-issued store barcodes at a glance; continuous sequence, never
// resets, since a barcode must never repeat across the store's lifetime
// even if inventory categories or years change.
async function generateBarcode() {
  const seq = await getNextSequence("barcode");
  return `89${pad(seq, 11)}`;
}

async function generatePurchaseId() {
  const year = new Date().getFullYear();
  const seq = await getNextSequence(`purchase-${year}`);
  return `PUR-${year}-${pad(seq, 6)}`;
}

module.exports = { getNextSequence, generateOrderId, generateInventorySku, generateBarcode, generatePurchaseId };

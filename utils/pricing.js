// Centralized margin calculation — pulled out of controller logic so a
// future Configuration module (per-brand or global margin %) can replace
// these constants without touching any call site.
const MARGINS = {
  mrp: 1.25,
  msp: 1.4,
};

function round2(num) {
  return Math.round(num * 100) / 100;
}

function calculateMrp(costPrice) {
  if (costPrice === undefined || costPrice === null) return undefined;
  return round2(costPrice * MARGINS.mrp);
}

function calculateMsp(costPrice) {
  if (costPrice === undefined || costPrice === null) return undefined;
  return round2(costPrice * MARGINS.msp);
}

module.exports = { MARGINS, calculateMrp, calculateMsp };
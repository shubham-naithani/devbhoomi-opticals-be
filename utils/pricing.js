const MARGINS = {
  mrp: 1.4,  // was 1.25 — now the editable ceiling price
  msp: 1.25, // was 1.4 — now the fixed floor, never editable
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
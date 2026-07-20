const Razorpay = require("razorpay");
const crypto = require("crypto");

// Lazily constructed — NOT at module load time. Building this eagerly
// would crash the entire server on startup if RAZORPAY_KEY_ID/SECRET
// aren't set yet (e.g. while KYC is still pending), taking down every
// unrelated route along with it. Deferring construction means only an
// actual payment attempt fails until real keys are configured.
let razorpayInstance = null;

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(
      new Error("Razorpay is not configured yet — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET"),
      { statusCode: 503 }
    );
  }
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

async function createRazorpayOrder({ amount, currency = "INR", receipt }) {
  const razorpay = getRazorpay();
  return razorpay.orders.create({ amount, currency, receipt });
}

async function createUpiQr({ amount, orderDbId, orderNumber }) {
  const razorpay = getRazorpay();
  return razorpay.qrCode.create({
    type: "upi_qr",
    usage: "single_use",
    fixed_amount: true,
    payment_amount: amount,
    description: `Order ${orderNumber}`,
    close_by: Math.floor(Date.now() / 1000) + 600,
    notes: { orderDbId: orderDbId.toString() },
  });
}

function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error("Razorpay is not configured yet"), { statusCode: 503 });
  }
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  return expected === razorpaySignature;
}

function verifyWebhookSignature(rawBody, signature) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    throw Object.assign(new Error("Razorpay webhook secret is not configured yet"), { statusCode: 503 });
  }
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

module.exports = { createRazorpayOrder, createUpiQr, verifyPaymentSignature, verifyWebhookSignature };
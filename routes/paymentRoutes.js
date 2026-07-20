const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  createOrderPayment,
  verifyPayment,
  razorpayWebhook,
  createUpiQrPayment,
  getUpiQrStatus,
} = require("../controllers/paymentController");

router.post("/razorpay/order/:orderId", protect, createOrderPayment);
router.post("/razorpay/verify", protect, verifyPayment);
router.post("/upi-qr/:orderId", protect, createUpiQrPayment);
router.get("/upi-qr/:orderId/status", protect, getUpiQrStatus);
router.post("/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

module.exports = router;
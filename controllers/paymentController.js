const Order = require("../models/Order");
const { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature, createUpiQr } = require("../services/razorpayService");
const { logTransaction } = require("../utils/transactionLogger");
const { logAudit } = require("../utils/auditLogger");
// POST /api/payments/razorpay/order/:orderId (logged-in customer)
// Creates a Razorpay order for the remaining balance on an existing order,
// and returns what the frontend needs to open the Checkout widget.
async function createOrderPayment(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, isDeleted: { $ne: true } });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Only the order's own customer can pay for it.
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "This order is already fully paid" });
    }

    const remainingBalance = order.totalAmount - order.amountPaid;
    const amountInPaise = Math.round(remainingBalance * 100);

    const rzpOrder = await createRazorpayOrder({
      amount: amountInPaise,
      receipt: order.orderId,
    });

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: rzpOrder.id,
      amount: amountInPaise,
      currency: "INR",
      orderId: order._id,
      orderNumber: order.orderId,
    });
  } catch (err) {
    next(err);
  }
}

// Shared finalize step — used by both the client-side verify call and the
// server-side webhook, so a payment is processed exactly once no matter
// which path (or both) actually fires.
async function finalizePayment(order, razorpayPaymentId, performedBy) {
  // Idempotency guard: if this order is already fully paid, do nothing —
  // covers the case where both the client verify call AND the webhook
  // arrive for the same successful payment.
  if (order.paymentStatus === "paid") return order;

  const appliedAmount = order.totalAmount - order.amountPaid;

  order.amountPaid = order.totalAmount;
  order.paymentMethod = "razorpay";
  order.razorpayPaymentId = razorpayPaymentId;
  await order.save(); // pre-save hook sets paymentStatus to "paid"

  await logTransaction({
    orderId: order._id,
    type: "payment",
    amount: appliedAmount,
    method: "razorpay",
    performedBy: performedBy || order.customer,
    note: `Razorpay payment for order ${order.orderId}`,
  });

  await logAudit({
    entityType: "Order",
    entityId: order._id,
    action: "update",
    user: { _id: performedBy || order.customer, name: "Razorpay" },
    summary: `Payment of Rs.${appliedAmount} received via Razorpay for order ${order.orderId}`,
  });

  return order;
}

// POST /api/payments/razorpay/verify (logged-in customer) — called by the
// frontend immediately after the Checkout widget reports success. Fast
// feedback for the UI, but NOT solely relied upon — the webhook below is
// the authoritative confirmation in case this call never happens.
async function verifyPayment(req, res, next) {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ message: "Order/payment mismatch" });
    }

    const valid = verifyPaymentSignature({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });
    if (!valid) return res.status(400).json({ message: "Payment verification failed" });

    const updated = await finalizePayment(order, razorpay_payment_id, req.user._id);
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

// POST /api/payments/razorpay/webhook — server-to-server, no user session.
// Requires the raw request body (see routes file) to verify the signature
// correctly, since Razorpay signs the exact raw bytes sent.
async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body;

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    if (event.event === "payment.captured") {
      // Standard Checkout-widget flow (cards/UPI-intent/netbanking/wallets).
      const payment = event.payload.payment.entity;
      const order = await Order.findOne({ razorpayOrderId: payment.order_id });
      if (order) {
        await finalizePayment(order, payment.id, null);
      }
    } else if (event.event === "qr_code.credited") {
      // Dedicated UPI QR flow — payment is matched via the QR code's own
      // id, not an "order" in Razorpay's sense (this QR flow doesn't use
      // Razorpay Orders at all, so razorpayOrderId is never involved here).
      const qrCode = event.payload.qr_code.entity;
      const payment = event.payload.payment.entity;
      const order = await Order.findOne({ razorpayQrCodeId: qrCode.id });
      if (order) {
        await finalizePayment(order, payment.id, null);
      }
    }
    // Any other event type: acknowledge and ignore — nothing else is
    // relevant to this app's payment flows right now.

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/payments/upi-qr/:orderId (logged-in customer) — creates a
// scannable UPI QR for the exact remaining balance. Distinct from the
// Checkout flow above: no popup, the customer scans with their own phone's
// UPI app, so there's no same-session redirect to rely on afterward.
async function createUpiQrPayment(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, isDeleted: { $ne: true } });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "This order is already fully paid" });
    }

    const remainingBalance = order.totalAmount - order.amountPaid;
    const amountInPaise = Math.round(remainingBalance * 100);

    const qr = await createUpiQr({
      amount: amountInPaise,
      orderDbId: order._id,
      orderNumber: order.orderId,
    });

    order.razorpayQrCodeId = qr.id;
    await order.save();

    res.json({
      qrCodeId: qr.id,
      imageUrl: qr.image_url,
      amount: amountInPaise,
      expiresAt: qr.close_by,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/upi-qr/:orderId/status (logged-in customer) — polled
// by the frontend every few seconds while the QR is displayed, since
// there's no page redirect to signal completion the way Checkout has.
// Just reads the order's current state — the webhook is what actually
// updates it in the background when the customer completes payment.
async function getUpiQrStatus(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, isDeleted: { $ne: true } })
      .select("paymentStatus amountPaid totalAmount");
    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({
      paymentStatus: order.paymentStatus,
      amountPaid: order.amountPaid,
      totalAmount: order.totalAmount,
      isPaid: order.paymentStatus === "paid",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrderPayment, verifyPayment, razorpayWebhook, createUpiQrPayment, getUpiQrStatus };
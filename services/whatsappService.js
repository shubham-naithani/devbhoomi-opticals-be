/**
 * WhatsApp notification service.
 *
 * Real sending requires a WhatsApp Business API connection — either Meta's
 * official Cloud API directly, or a provider (Twilio, Gupshup, AiSensy,
 * Interakt, etc.) sitting in front of it. That needs a Meta Business account,
 * a verified phone number, and approved message templates — none of which
 * exist yet for this store.
 *
 * Until WHATSAPP_ENABLED=true and the required env vars are set, every call
 * here just logs what WOULD have been sent, so the rest of the app can be
 * built and tested against this service today, and switched on for real the
 * moment credentials exist — no code changes needed elsewhere.
 *
 * To go live with Meta's Cloud API, set in .env:
 *   WHATSAPP_ENABLED=true
 *   WHATSAPP_TOKEN=<permanent access token>
 *   WHATSAPP_PHONE_NUMBER_ID=<from Meta Business dashboard>
 */

const ENABLED = String(process.env.WHATSAPP_ENABLED).toLowerCase() === "true";
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ADMIN_NOTIFY_PHONE = process.env.ADMIN_NOTIFY_PHONE; // owner's WhatsApp number

async function sendWhatsAppMessage(toPhone, message) {
  if (!toPhone) return;

  if (!ENABLED || !TOKEN || !PHONE_NUMBER_ID) {
    console.log(`[WhatsApp:stub] Would send to ${toPhone} -> "${message}"`);
    return { simulated: true };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: message },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[WhatsApp] Send failed (${res.status}):`, errBody);
      return { simulated: false, success: false };
    }

    return { simulated: false, success: true };
  } catch (err) {
    console.error("[WhatsApp] Send error:", err.message);
    return { simulated: false, success: false };
  }
}

// ---- Order lifecycle message templates -----------------------------------

async function notifyOrderCreated(order, customerPhone) {
  const balance = order.totalAmount - order.amountPaid;
  const paymentLine =
    order.amountPaid >= order.totalAmount
      ? `Paid in full: Rs.${order.amountPaid}.`
      : order.amountPaid > 0
      ? `Advance received: Rs.${order.amountPaid}. Balance due: Rs.${balance}.`
      : `Balance due: Rs.${order.totalAmount}.`;

  const message =
    `Hi! Your order ${order.orderId} at Devbhoomi Opticals has been placed. ` +
    `Total: Rs.${order.totalAmount}. ${paymentLine}`;

  await sendWhatsAppMessage(customerPhone, message);

  if (ADMIN_NOTIFY_PHONE) {
    await sendWhatsAppMessage(
      ADMIN_NOTIFY_PHONE,
      `New order ${order.orderId} placed (${order.source}) — Rs.${order.totalAmount}. ${paymentLine}`
    );
  }
}

async function notifyPaymentReceived(order, amountJustPaid, customerPhone) {
  const balance = order.totalAmount - order.amountPaid;
  const message =
    balance > 0
      ? `Payment received: Rs.${amountJustPaid} towards order ${order.orderId}. Remaining balance: Rs.${balance}.`
      : `Payment received: Rs.${amountJustPaid} towards order ${order.orderId}. Fully paid — thank you!`;

  await sendWhatsAppMessage(customerPhone, message);

  if (ADMIN_NOTIFY_PHONE) {
    await sendWhatsAppMessage(ADMIN_NOTIFY_PHONE, `Payment of Rs.${amountJustPaid} recorded on order ${order.orderId}.`);
  }
}

async function notifyOrderStatusChanged(order, customerPhone) {
  const statusText = {
    pending: "is pending confirmation",
    confirmed: "has been confirmed",
    delivered: "has been delivered — thank you!",
    cancelled: "has been cancelled",
  }[order.status] || `status changed to ${order.status}`;

  const message = `Update: your order ${order.orderId} at Devbhoomi Opticals ${statusText}.`;
  await sendWhatsAppMessage(customerPhone, message);

  if (ADMIN_NOTIFY_PHONE) {
    await sendWhatsAppMessage(ADMIN_NOTIFY_PHONE, `Order ${order.orderId} status -> ${order.status}.`);
  }
}

module.exports = { sendWhatsAppMessage, notifyOrderCreated, notifyOrderStatusChanged, notifyPaymentReceived };

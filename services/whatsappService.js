/**
 * WhatsApp notifications via Meta's WhatsApp Cloud API.
 *
 * Falls back to console-log "stub mode" whenever WHATSAPP_ENABLED isn't
 * exactly "true", or the token/phone number ID env vars are missing — so
 * the rest of the app (order creation, status updates, payments) never
 * breaks just because WhatsApp isn't configured yet or Meta is down.
 *
 * All business-initiated messages (order confirmed, status changed,
 * payment received) require a pre-approved WhatsApp message template —
 * free-form text is only allowed as a REPLY within 24h of the customer
 * messaging first, which doesn't apply here. Template names are read from
 * env vars so approved names can be swapped in later without a code change.
 */

// Matches the same human-readable labels already used in the admin
// frontend's status dropdown — keeps customer-facing wording consistent
// with what staff see internally.
const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  ready_for_pickup: "Ready for Pickup",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const GRAPH_API_VERSION = "v20.0";

function isConfigured() {
  return (
    process.env.WHATSAPP_ENABLED === "true" &&
    !!process.env.WHATSAPP_TOKEN &&
    !!process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

// WhatsApp requires E.164-ish numbers (country code, no symbols/spaces).
// Defaults to India (+91) if a 10-digit local number is passed in, since
// that's what's stored today (e.g. "9876543210") — adjust the default
// country code here if the store ever serves outside India.
function formatPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length > 10) return digits; // already has a country code
  return null;
}

async function sendTemplateMessage(toPhone, templateName, languageCode, parameters) {
  const formattedPhone = formatPhone(toPhone);
  if (!formattedPhone) {
    console.log(`[WhatsApp] Skipped — no valid phone number for template "${templateName}"`);
    return;
  }

  if (!isConfigured()) {
    console.log(
      `[WhatsApp STUB] Would send template "${templateName}" to ${formattedPhone} with params:`,
      parameters
    );
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode || "en" },
      components: [
        {
          type: "body",
          parameters: parameters.map((text) => ({ type: "text", text: String(text) })),
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WhatsApp] Failed to send "${templateName}" to ${formattedPhone}:`, errText);
    }
  } catch (err) {
    // Never throw — every call site already treats this as fire-and-forget
    // (.catch(() => {})), but logging here too helps spot real delivery
    // problems rather than them silently vanishing.
    console.error(`[WhatsApp] Network error sending "${templateName}":`, err.message);
  }
}

function formatStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

// ---- Public API — signatures match existing orderController.js call sites ----

async function notifyOrderCreated(order, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_ORDER_CREATED || "order_created";
  await sendTemplateMessage(customerPhone, templateName, "en", [order.orderId, order.totalAmount]);
}

async function notifyOrderStatusChanged(order, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_STATUS_CHANGED || "order_status_changed";
  await sendTemplateMessage(customerPhone, templateName, "en", [order.orderId, formatStatusLabel(order.status)]);
}

async function notifyPaymentReceived(order, amount, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_PAYMENT_RECEIVED || "payment_received";
  const balanceDue = Math.max(order.totalAmount - order.amountPaid, 0);
  await sendTemplateMessage(customerPhone, templateName, "en", [order.orderId, amount, balanceDue]);
}

async function notifyLowStock(items) {
  const templateName = process.env.WHATSAPP_TEMPLATE_LOW_STOCK || "low_stock_alert";
  const adminPhone = process.env.ADMIN_NOTIFY_PHONE;
  if (!adminPhone) {
    console.log("[WhatsApp] Skipped low-stock alert — ADMIN_NOTIFY_PHONE not set");
    return;
  }

  const summary = items
    .slice(0, 5)
    .map((i) => `${i.name} (${i.stock} left)`)
    .join(", ");
  const moreCount = items.length > 5 ? ` +${items.length - 5} more` : "";

  await sendTemplateMessage(adminPhone, templateName, "en", [
    items.length,
    `${summary}${moreCount}`,
  ]);
}

let lastCriticalAlertAt = 0;
const CRITICAL_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

async function notifyCriticalError(errorDoc) {
  const now = Date.now();
  if (now - lastCriticalAlertAt < CRITICAL_ALERT_COOLDOWN_MS) {
    console.log("[WhatsApp] Critical error alert suppressed — cooldown active (avoids spam during an outage)");
    return;
  }

  const templateName = process.env.WHATSAPP_TEMPLATE_CRITICAL_ERROR || "critical_error_alert";
  const adminPhone = process.env.ADMIN_NOTIFY_PHONE;
  if (!adminPhone) {
    console.log("[WhatsApp] Skipped critical error alert — ADMIN_NOTIFY_PHONE not set");
    return;
  }

  lastCriticalAlertAt = now;
  const shortMessage = (errorDoc.message || "Unknown error").slice(0, 100);
  await sendTemplateMessage(adminPhone, templateName, "en", [shortMessage, errorDoc.route || "unknown"]);
}

module.exports = { notifyOrderCreated, notifyOrderStatusChanged, notifyPaymentReceived, notifyLowStock, notifyCriticalError };
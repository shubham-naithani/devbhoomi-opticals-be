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

const REPAIR_STATUS_LABELS = {
  received: "Received",
  in_progress: "In Progress",
  ready_for_pickup: "Ready for Pickup",
  collected: "Collected",
  cancelled: "Cancelled",
};

const GRAPH_API_VERSION = "v20.0";

// Meta template language codes are locale-specific (e.g. "en_US"), not
// bare "en". This must match whatever language you selected when creating
// each template in WhatsApp Manager, or the send will fail with a
// language-mismatch error even if the template name/params are correct.
const DEFAULT_LANGUAGE_CODE = "en_US";

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

// Returns true if the message was actually handed to the API (or accepted
// in stub mode) and false if it was skipped/failed — callers that only
// care about fire-and-forget delivery (order/repair/invoice notifications)
// can keep ignoring the return value exactly as before; Marketing's
// sendCoupon uses it to record whatsappStatus on the issued coupon.
async function sendTemplateMessage(toPhone, templateName, languageCode, parameters) {
  const formattedPhone = formatPhone(toPhone);
  if (!formattedPhone) {
    console.log(`[WhatsApp] Skipped — no valid phone number for template "${templateName}"`);
    return false;
  }

  if (!isConfigured()) {
    console.log(
      `[WhatsApp STUB] Would send template "${templateName}" to ${formattedPhone} with params:`,
      parameters
    );
    return true;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: formattedPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode || DEFAULT_LANGUAGE_CODE },
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
      return false;
    }
    return true;
  } catch (err) {
    // Never throw — every call site already treats this as fire-and-forget
    // (.catch(() => {})), but logging here too helps spot real delivery
    // problems rather than them silently vanishing.
    console.error(`[WhatsApp] Network error sending "${templateName}":`, err.message);
    return false;
  }
}

function formatStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

// ---- Public API — signatures match existing orderController.js call sites ----

async function notifyOrderCreated(order, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_ORDER_CREATED || "order_created";
  await sendTemplateMessage(customerPhone, templateName, DEFAULT_LANGUAGE_CODE, [order.orderId, order.totalAmount]);
}

async function notifyOrderStatusChanged(order, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_STATUS_CHANGED || "order_status_changed";
  await sendTemplateMessage(customerPhone, templateName, DEFAULT_LANGUAGE_CODE, [
    order.orderId,
    formatStatusLabel(order.status),
  ]);
}

async function notifyPaymentReceived(order, amount, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_PAYMENT_RECEIVED || "payment_received";
  const balanceDue = Math.max(order.totalAmount - order.amountPaid, 0);
  // Param order sent here is [orderId, amount, balanceDue] -> {{1}}, {{2}}, {{3}}.
  // Make sure the approved template body in WhatsApp Manager references
  // {{1}} as the order id, {{2}} as the amount just paid, and {{3}} as the
  // remaining balance, in that order.
  await sendTemplateMessage(customerPhone, templateName, DEFAULT_LANGUAGE_CODE, [
    order.orderId,
    amount,
    balanceDue,
  ]);
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

  await sendTemplateMessage(adminPhone, templateName, DEFAULT_LANGUAGE_CODE, [
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
  await sendTemplateMessage(adminPhone, templateName, DEFAULT_LANGUAGE_CODE, [
    shortMessage,
    errorDoc.route || "unknown",
  ]);
}

function formatRepairStatusLabel(status) {
  return REPAIR_STATUS_LABELS[status] || status;
}

async function notifyRepairCreated(ticket, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_REPAIR_CREATED || "repair_created";
  const feeNote = ticket.feeAmount > 0 ? `Fee: Rs.${ticket.feeAmount}` : "Free (under warranty)";
  await sendTemplateMessage(customerPhone, templateName, DEFAULT_LANGUAGE_CODE, [
    ticket.repairId,
    ticket.itemName,
    feeNote,
  ]);
}

async function notifyRepairStatusChanged(ticket, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_REPAIR_STATUS_CHANGED || "repair_status_changed";
  await sendTemplateMessage(customerPhone, templateName, DEFAULT_LANGUAGE_CODE, [
    ticket.repairId,
    ticket.itemName,
    formatRepairStatusLabel(ticket.status),
  ]);
}

async function notifyInvoiceGenerated(order, invoiceUrl, customerPhone) {
  const templateName = process.env.WHATSAPP_TEMPLATE_INVOICE_GENERATED || "invoice_generated";
  await sendTemplateMessage(customerPhone, templateName, DEFAULT_LANGUAGE_CODE, [order.orderId, invoiceUrl]);
}

// --- Marketing (new) -------------------------------------------------------
// This is a 9th template, distinct from the 8 already in WhatsApp Manager —
// it needs to be created and approved by Meta before real sends will work.
// Until then this behaves exactly like every other notify* function during
// setup: stub-mode console.log if WHATSAPP_ENABLED isn't "true" yet.
function formatDiscountText(coupon) {
  return coupon.discountType === "percentage" ? `${coupon.value}% off` : `Rs.${coupon.value} off`;
}

async function notifyCouponIssued(recipientPhone, recipientName, coupon) {
  const templateName = process.env.WHATSAPP_TEMPLATE_COUPON_ISSUED || "coupon_issued";
  // Param order: [name, couponCode, discountText] -> {{1}}, {{2}}, {{3}} in the approved template body.
  return sendTemplateMessage(recipientPhone, templateName, DEFAULT_LANGUAGE_CODE, [
    recipientName || "there",
    coupon.code,
    formatDiscountText(coupon),
  ]);
}

module.exports = {
  notifyOrderCreated,
  notifyOrderStatusChanged,
  notifyPaymentReceived,
  notifyLowStock,
  notifyCriticalError,
  notifyRepairCreated,
  notifyRepairStatusChanged,
  notifyInvoiceGenerated,
  notifyCouponIssued,
};

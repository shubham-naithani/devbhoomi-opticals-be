const ErrorLog = require("../models/ErrorLog");
const { notifyCriticalError } = require("../services/whatsappService");

async function logError({ source, severity, message, stack, route, method, statusCode, user, metadata }) {
  try {
    const doc = await ErrorLog.create({
      source,
      severity: severity || "critical",
      message,
      stack,
      route,
      method,
      statusCode,
      userId: user?._id,
      userName: user?.name,
      metadata,
    });

    if (doc.severity === "critical") {
      notifyCriticalError(doc).catch(() => {});
    }
    return doc;
  } catch (err) {
    // If logging itself fails, fall back to console — never let error
    // logging become a second source of crashes.
    console.error("Failed to write ErrorLog:", err);
    console.error("Original error was:", message);
  }
}

module.exports = { logError };
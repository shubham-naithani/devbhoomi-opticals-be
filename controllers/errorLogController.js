const ErrorLog = require("../models/ErrorLog");
const { logError } = require("../utils/errorLogger");

// POST /api/error-logs/frontend — no admin auth required, since a broken
// page could be hit by anyone (customer or staff) and we still want to
// know about it. optionalAuth attaches req.user if a valid token exists.
async function receiveFrontendError(req, res, next) {
  try {
    const { message, stack, url } = req.body;
    await logError({
      source: "frontend",
      severity: "critical",
      message: message || "Unknown frontend error",
      stack,
      route: url,
      user: req.user,
    });
  } catch (err) {
    console.error("Failed to log frontend error:", err);
  }
  // Always acknowledge, even if logging internally failed — the client
  // shouldn't get stuck retrying a logging call.
  res.status(201).json({ received: true });
}

// GET /api/error-logs (admin only)
async function getErrorLogs(req, res, next) {
  try {
    const { source, severity, search, from, to, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (source) filter.source = source;
    if (severity) filter.severity = severity;
    if (search) filter.message = { $regex: search, $options: "i" };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      ErrorLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      ErrorLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

module.exports = { receiveFrontendError, getErrorLogs };
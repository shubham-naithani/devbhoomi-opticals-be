const AuditLog = require("../models/AuditLog");

// GET /api/audit-logs (admin only)
async function getAuditLogs(req, res, next) {
  try {
    const { entityType, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (entityType) filter.entityType = entityType;

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAuditLogs };

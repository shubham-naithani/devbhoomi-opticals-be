const AuditLog = require("../models/AuditLog");

// Never let a logging failure break the actual request — audit logging is
// best-effort supporting infrastructure, not a reason to fail a sale.
async function logAudit({ entityType, entityId, action, user, summary }) {
  try {
    await AuditLog.create({
      entityType,
      entityId,
      action,
      performedBy: user._id,
      performedByName: user.name,
      summary,
    });
  } catch (err) {
    console.error("[AuditLog] Failed to record entry:", err.message);
  }
}

module.exports = { logAudit };

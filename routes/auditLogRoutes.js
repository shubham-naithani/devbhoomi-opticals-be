const express = require("express");
const { getAuditLogs } = require("../controllers/auditLogController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect, authorize("admin"));
router.get("/", getAuditLogs);

module.exports = router;

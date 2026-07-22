const express = require("express");
const router = express.Router();
const { protect, authorize, optionalAuth } = require("../middleware/auth");
const { receiveFrontendError, getErrorLogs } = require("../controllers/errorLogController");

router.post("/frontend", optionalAuth, receiveFrontendError);
router.get("/", protect, authorize("admin"), getErrorLogs);

module.exports = router;
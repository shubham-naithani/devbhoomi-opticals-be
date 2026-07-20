const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { getTransactions, getPnlSummary } = require("../controllers/transactionController");

router.get("/", protect, authorize("admin"), getTransactions);
router.get("/pnl", protect, authorize("admin"), getPnlSummary);

module.exports = router;
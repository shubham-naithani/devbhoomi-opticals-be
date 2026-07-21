const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { createPurchaseRecord, getPurchaseRecords, getPurchaseRecordById } = require("../controllers/purchaseController");

router.post("/", protect, authorize("admin"), createPurchaseRecord);
router.get("/", protect, authorize("admin"), getPurchaseRecords);
router.get("/:id", protect, authorize("admin"), getPurchaseRecordById);

module.exports = router;
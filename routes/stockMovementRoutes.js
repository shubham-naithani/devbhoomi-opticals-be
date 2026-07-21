const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { getStockMovements } = require("../controllers/stockMovementController");

router.get("/", protect, authorize("admin"), getStockMovements);

module.exports = router;
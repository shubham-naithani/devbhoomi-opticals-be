const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { getDashboardStats } = require("../controllers/dashboardController");

router.get("/stats", protect, authorize("admin"), getDashboardStats);

module.exports = router;
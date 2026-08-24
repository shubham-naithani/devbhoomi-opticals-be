const express = require("express");
const multer = require("multer");
const router = express.Router();

const { protect, authorize } = require("../middleware/auth");

const {
  uploadLeads,
  listLeads,
  listExistingCustomers,
  generateReferralCoupon,
  sendCoupon,
  getMarketingLogs,
} = require("../controllers/marketingController");

const upload = multer({ storage: multer.memoryStorage() });

// Marketing is admin-only, same as Coupons — staff don't get this per the existing
// access control matrix (no Users, Coupons, P&L, Error Log, Inventory edit/delete, Print label).
router.use(protect, authorize("admin"));

router.post("/leads/upload", upload.single("file"), uploadLeads);
router.get("/leads", listLeads);
router.get("/customers", listExistingCustomers);
router.post("/referral-coupons", generateReferralCoupon);
router.post("/send", sendCoupon);
router.get("/logs", getMarketingLogs);

module.exports = router;

// In app.js / server.js:
// app.use("/api/marketing", require("./routes/marketingRoutes"));

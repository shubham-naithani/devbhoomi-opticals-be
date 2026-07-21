const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { createCoupon, getCoupons, updateCoupon, deleteCoupon } = require("../controllers/couponController");

router.post("/", protect, authorize("admin"), createCoupon);
router.get("/", protect, authorize("admin"), getCoupons);
router.put("/:id", protect, authorize("admin"), updateCoupon);
router.delete("/:id", protect, authorize("admin"), deleteCoupon);

module.exports = router;
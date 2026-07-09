const express = require("express");
const {
  createOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect); // every order route requires a logged-in user

router.post("/", createOrder);
router.get("/my", getMyOrders);

router.get("/", authorize("admin"), getAllOrders);
router.put("/:id/status", authorize("admin"), updateOrderStatus);

module.exports = router;

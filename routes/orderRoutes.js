const express = require("express");
const {
  createOrder,
  createWalkInOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect); // every order route requires a logged-in user

router.post("/", createOrder);
router.get("/my", getMyOrders);

router.post("/walk-in", authorize("admin", "staff"), createWalkInOrder);
router.get("/", authorize("admin", "staff"), getAllOrders);
router.put("/:id/status", authorize("admin", "staff"), updateOrderStatus);

module.exports = router;

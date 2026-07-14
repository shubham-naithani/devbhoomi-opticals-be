const express = require("express");
const {
  createOrder,
  createWalkInOrder,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  recordPayment,
  updateOrder,
  deleteOrder,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect); // every order route requires a logged-in user

router.post("/", createOrder);
router.get("/my", getMyOrders);

router.post("/walk-in", authorize("admin", "staff"), createWalkInOrder);
router.get("/", authorize("admin", "staff"), getAllOrders);
router.get("/:id", authorize("admin", "staff"), getOrderById);
router.put("/:id", authorize("admin", "staff"), updateOrder);
router.put("/:id/status", authorize("admin", "staff"), updateOrderStatus);
router.put("/:id/payment", authorize("admin", "staff"), recordPayment);
router.delete("/:id", authorize("admin"), deleteOrder); // soft delete — admin only

module.exports = router;

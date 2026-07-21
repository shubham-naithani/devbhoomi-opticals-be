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
  refundOrder,
  settleRefund,
  bulkUpdateOrderStatus,
  bulkDeleteOrders,
} = require("../controllers/orderController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect); // every order route requires a logged-in user

router.post("/", createOrder);
router.get("/my", getMyOrders);

router.post("/walk-in", authorize("admin", "staff"), createWalkInOrder);
router.get("/", authorize("admin", "staff"), getAllOrders);

// Bulk actions — registered BEFORE "/:id" routes for the same reason as
// inventoryRoutes.js: "/bulk" is a single path segment and would otherwise
// be swallowed by "/:id", causing Mongoose to try (and fail) to treat the
// literal string "bulk" as an ObjectId.
router.put("/bulk/status", authorize("admin", "staff"), bulkUpdateOrderStatus);
router.delete("/bulk", authorize("admin"), bulkDeleteOrders);

router.get("/:id", authorize("admin", "staff"), getOrderById);
router.put("/:id", authorize("admin", "staff"), updateOrder);
router.put("/:id/status", authorize("admin", "staff"), updateOrderStatus);
router.put("/:id/payment", authorize("admin", "staff"), recordPayment);
router.delete("/:id", authorize("admin"), deleteOrder); // soft delete — admin only
router.put("/:id/refund", authorize("admin", "staff"), refundOrder);
router.put("/:id/settle-refund", authorize("admin", "staff"), settleRefund);

module.exports = router;
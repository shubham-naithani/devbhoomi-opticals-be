const express = require("express");
const {
  getInventory,
  getInventoryById,
  createInventory,
  updateInventory,
  deleteInventory,
} = require("../controllers/inventoryController");
const { protect, authorize, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// Public catalog browsing (optionalAuth lets an admin see inactive items too)
router.get("/", optionalAuth, getInventory);
router.get("/:id", optionalAuth, getInventoryById);

// Admin-only writes
router.post("/", protect, authorize("admin"), createInventory);
router.put("/:id", protect, authorize("admin"), updateInventory);
router.delete("/:id", protect, authorize("admin"), deleteInventory);

module.exports = router;

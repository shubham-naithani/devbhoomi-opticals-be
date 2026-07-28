const express = require("express");
const {
  lookupForRepair,
  createRepairTicket,
  getAllRepairs,
  getRepairById,
  updateRepairStatus,
  updateRepair,
  deleteRepair,
} = require("../controllers/repairController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect);
router.use(authorize("admin", "staff")); // no customer self-service on repairs

router.get("/lookup", lookupForRepair);
router.post("/", createRepairTicket);
router.get("/", getAllRepairs);
router.get("/:id", getRepairById);
router.put("/:id/status", updateRepairStatus);
router.put("/:id", updateRepair);
router.delete("/:id", authorize("admin"), deleteRepair);

module.exports = router;
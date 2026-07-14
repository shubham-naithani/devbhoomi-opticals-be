const express = require("express");
const multer = require("multer");
const {
  getInventory,
  getInventoryById,
  createInventory,
  updateInventory,
  deleteInventory,
  uploadImages,
} = require("../controllers/inventoryController");
const { protect, authorize, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// Keep uploads in memory (not written to disk) — they're forwarded straight
// to Azure Blob Storage. Cap at 6 images per request, 8MB each, image files only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// Public catalog browsing (optionalAuth lets an admin see inactive items too)
router.get("/", optionalAuth, getInventory);
router.get("/:id", optionalAuth, getInventoryById);

// Admin-only writes
router.post("/upload-images", protect, authorize("admin"), upload.array("images", 6), uploadImages);
router.post("/", protect, authorize("admin"), createInventory);
router.put("/:id", protect, authorize("admin"), updateInventory);
router.delete("/:id", protect, authorize("admin"), deleteInventory);

module.exports = router;

const express = require("express");
const multer = require("multer");
const {
  getInventory,
  getInventoryById,
  getBrands,
  createInventory,
  updateInventory,
  deleteInventory,
  addArticle,
  updateArticle,
  deleteArticle,
  uploadImages,
} = require("../controllers/inventoryController");
const { protect, authorize, optionalAuth } = require("../middleware/auth");

const router = express.Router();

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

// Public catalog browsing (optionalAuth lets an admin/staff see inactive items too)
router.get("/brands", getBrands);
router.get("/", optionalAuth, getInventory);
router.get("/:id", optionalAuth, getInventoryById);

// Admin-only writes
router.post("/upload-images", protect, authorize("admin"), upload.array("images", 6), uploadImages);
router.post("/", protect, authorize("admin"), createInventory);
router.put("/:id", protect, authorize("admin"), updateInventory);
router.delete("/:id", protect, authorize("admin"), deleteInventory);

router.post("/:id/articles", protect, authorize("admin"), addArticle);
router.put("/:id/articles/:articleId", protect, authorize("admin"), updateArticle);
router.delete("/:id/articles/:articleId", protect, authorize("admin"), deleteArticle);

module.exports = router;

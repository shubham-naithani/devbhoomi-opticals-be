const express = require("express");
const { searchByPhone, quickCreate } = require("../controllers/customerController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Available to admin and staff — this is store-counter functionality, not
// full user management (which stays admin-only in userRoutes).
router.use(protect, authorize("admin", "staff"));

router.get("/search", searchByPhone);
router.post("/quick-create", quickCreate);

module.exports = router;

const express = require("express");
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  changeMyPassword,
  listMyAddresses,
  addMyAddress,
  updateMyAddress,
  deleteMyAddress,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Self-service routes — logged-in user only, no admin role required
router.get("/me", protect, getMe);
router.put("/me", protect, updateMe);
router.put("/me/password", protect, changeMyPassword);
router.get("/me/addresses", protect, listMyAddresses);
router.post("/me/addresses", protect, addMyAddress);        // ← this one specifically
router.put("/me/addresses/:addressId", protect, updateMyAddress);
router.delete("/me/addresses/:addressId", protect, deleteMyAddress);

// Everything below this line requires admin
router.use(protect, authorize("admin"));

router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;


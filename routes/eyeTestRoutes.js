const express = require("express");
const { createEyeTest, getByCustomer, getLatestByCustomer } = require("../controllers/eyeTestController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect, authorize("admin", "staff"));

router.post("/", createEyeTest);
router.get("/customer/:customerId", getByCustomer);
router.get("/customer/:customerId/latest", getLatestByCustomer);

module.exports = router;

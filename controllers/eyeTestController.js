const EyeTest = require("../models/EyeTest");
const { logAudit } = require("../utils/auditLogger");

// POST /api/eye-tests (admin/staff)
async function createEyeTest(req, res, next) {
  try {
    const { customer, rightEye, leftEye, pupillaryDistance, nextCheckupDue, notes } = req.body;

    if (!customer) {
      return res.status(400).json({ message: "Customer is required" });
    }

    const eyeTest = await EyeTest.create({
      customer,
      rightEye,
      leftEye,
      pupillaryDistance,
      nextCheckupDue,
      notes,
      testedBy: req.user._id,
    });

    await logAudit({
      entityType: "EyeTest",
      entityId: eyeTest._id,
      action: "create",
      user: req.user,
      summary: `Eye test recorded for customer ${customer}`,
    });

    res.status(201).json({ eyeTest });
  } catch (err) {
    next(err);
  }
}

// GET /api/eye-tests/customer/:customerId (admin/staff) — full history, most recent first
async function getByCustomer(req, res, next) {
  try {
    const eyeTests = await EyeTest.find({ customer: req.params.customerId })
      .populate("testedBy", "name")
      .sort({ testedAt: -1 });

    res.json({ eyeTests });
  } catch (err) {
    next(err);
  }
}

// GET /api/eye-tests/customer/:customerId/latest (admin/staff)
async function getLatestByCustomer(req, res, next) {
  try {
    const eyeTest = await EyeTest.findOne({ customer: req.params.customerId })
      .populate("testedBy", "name")
      .sort({ testedAt: -1 });

    res.json({ eyeTest: eyeTest || null });
  } catch (err) {
    next(err);
  }
}

module.exports = { createEyeTest, getByCustomer, getLatestByCustomer };

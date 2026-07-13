const User = require("../models/User");
const { logAudit } = require("../utils/auditLogger");

// GET /api/customers/search?phone=98765... (admin/staff)
// Exact-ish lookup used by the "New in-store order" flow to autofill a
// returning customer's details from just their phone number.
async function searchByPhone(req, res, next) {
  try {
    const { phone } = req.query;
    if (!phone || phone.trim().length < 4) {
      return res.status(400).json({ message: "Enter at least 4 digits to search" });
    }

    const customers = await User.find({
      role: "customer",
      phone: { $regex: phone.trim(), $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({ customers });
  } catch (err) {
    next(err);
  }
}

// POST /api/customers/quick-create (admin/staff)
// Lightweight customer creation for walk-ins — only name + phone required.
// No password is set, so the account exists as a record but canLogin=false
// until the customer chooses to set a real password later (a "claim your
// account online" flow is a good future addition, not built yet).
async function quickCreate(req, res, next) {
  try {
    const { name, phone, email, address } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    const existing = await User.findOne({ phone: phone.trim() });
    if (existing) {
      return res.status(400).json({ message: "A customer with this phone number already exists" });
    }

    const customer = await User.create({
      name,
      phone: phone.trim(),
      email: email || undefined,
      role: "customer",
      source: "in_store",
      canLogin: false,
      address: address || undefined,
    });

    await logAudit({
      entityType: "User",
      entityId: customer._id,
      action: "create",
      user: req.user,
      summary: `Walk-in customer created: ${customer.name} (${customer.phone})`,
    });

    res.status(201).json({ customer });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchByPhone, quickCreate };

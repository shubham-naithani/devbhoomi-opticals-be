const Coupon = require("../models/Coupon");
const { logAudit } = require("../utils/auditLogger");

async function createCoupon(req, res, next) {
  try {
    const { code, discountType, value, minOrderValue, expiresAt, usageLimit } = req.body;

    if (!code || !code.trim()) return res.status(400).json({ message: "Coupon code is required" });
    if (!["fixed", "percentage"].includes(discountType)) {
      return res.status(400).json({ message: `discountType must be "fixed" or "percentage"` });
    }
    if (value === undefined || value === null || value < 0) {
      return res.status(400).json({ message: "A valid discount value is required" });
    }

    const existing = await Coupon.findOne({ code: code.trim().toUpperCase() });
    if (existing) return res.status(400).json({ message: "A coupon with this code already exists" });

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      discountType,
      value,
      minOrderValue: minOrderValue || 0,
      expiresAt: expiresAt || undefined,
      usageLimit: usageLimit || undefined,
      createdBy: req.user._id,
    });

    await logAudit({
      entityType: "Order", // no dedicated Coupon entityType in your AuditLog enum — reusing closest existing category; adjust if you want a new one added
      entityId: coupon._id,
      action: "create",
      user: req.user,
      summary: `Coupon created: ${coupon.code} (${coupon.discountType} ${coupon.value})`,
    });

    res.status(201).json({ coupon });
  } catch (err) {
    next(err);
  }
}

async function getCoupons(req, res, next) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (search) filter.code = { $regex: search, $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Coupon.countDocuments(filter),
    ]);

    res.json({ coupons, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

async function updateCoupon(req, res, next) {
  try {
    const { code, usageCount, ...updates } = req.body; // code and usageCount are never editable after creation
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });

    await logAudit({
      entityType: "Order",
      entityId: coupon._id,
      action: "update",
      user: req.user,
      summary: `Coupon updated: ${coupon.code}`,
    });

    res.json({ coupon });
  } catch (err) {
    next(err);
  }
}

async function deleteCoupon(req, res, next) {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });

    await logAudit({
      entityType: "Order",
      entityId: coupon._id,
      action: "delete",
      user: req.user,
      summary: `Coupon deleted: ${coupon.code}`,
    });

    res.json({ message: "Coupon deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
}

module.exports = { createCoupon, getCoupons, updateCoupon, deleteCoupon };
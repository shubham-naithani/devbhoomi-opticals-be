const Inventory = require("../models/Inventory");
const { generateInventorySku } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");

// GET /api/inventory — public: browse catalog. Admin/staff get inactive items too.
async function getInventory(req, res, next) {
  try {
    const { search = "", category, gender, page = 1, limit = 20 } = req.query;
    const isStaffOrAdmin = req.user && ["admin", "staff"].includes(req.user.role);

    const filter = isStaffOrAdmin ? {} : { isActive: true };
    if (search) filter.$text = { $search: search };
    if (category) filter.category = category;
    if (gender) filter.gender = gender;

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Inventory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Inventory.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/inventory/:id
async function getInventoryById(req, res, next) {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json({ item });
  } catch (err) {
    next(err);
  }
}

// POST /api/inventory (admin only)
// SKU is now always auto-generated server-side — never trusted/accepted from the client,
// so every item is guaranteed a unique, correctly-formatted code.
async function createInventory(req, res, next) {
  try {
    const { name, price } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: "Name and price are required" });
    }

    const sku = await generateInventorySku(req.body.category);
    const item = await Inventory.create({ ...req.body, sku });

    await logAudit({
      entityType: "Inventory",
      entityId: item._id,
      action: "create",
      user: req.user,
      summary: `Inventory item created: ${item.sku} — ${item.name}`,
    });

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

// PUT /api/inventory/:id (admin only)
async function updateInventory(req, res, next) {
  try {
    // SKU is immutable once assigned — strip it from update payloads even if sent.
    const { sku, ...updates } = req.body;

    const item = await Inventory.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: "Item not found" });

    await logAudit({
      entityType: "Inventory",
      entityId: item._id,
      action: "update",
      user: req.user,
      summary: `Inventory item updated: ${item.sku} — ${item.name}`,
    });

    res.json({ item });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/inventory/:id (admin only)
async function deleteInventory(req, res, next) {
  try {
    const item = await Inventory.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    await logAudit({
      entityType: "Inventory",
      entityId: item._id,
      action: "delete",
      user: req.user,
      summary: `Inventory item deleted: ${item.sku} — ${item.name}`,
    });

    res.json({ message: "Item deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getInventory,
  getInventoryById,
  createInventory,
  updateInventory,
  deleteInventory,
};

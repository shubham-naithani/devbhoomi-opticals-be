const Inventory = require("../models/Inventory");

// GET /api/inventory — public: browse catalog. Admin gets inactive items too.
async function getInventory(req, res, next) {
  try {
    const { search = "", category, gender, page = 1, limit = 20 } = req.query;
    const isAdmin = req.user && req.user.role === "admin";

    const filter = isAdmin ? {} : { isActive: true };
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
async function createInventory(req, res, next) {
  try {
    const { name, price } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: "Name and price are required" });
    }

    const item = await Inventory.create(req.body);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

// PUT /api/inventory/:id (admin only)
async function updateInventory(req, res, next) {
  try {
    const item = await Inventory.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: "Item not found" });
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

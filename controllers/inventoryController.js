const Inventory = require("../models/Inventory");
const { generateInventorySku } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");
const { uploadInventoryImages, deleteInventoryImages } = require("../services/blobStorageService");

// POST /api/inventory/upload-images (admin only)
// Accepts multipart files under the field name "images" (up to 6), uploads
// each to Azure Blob Storage, and returns their public URLs. The frontend
// calls this first, then includes the returned URLs in the create/update
// payload — decoupling "pick files" from "save the item" so a preview can be
// shown before committing.
async function uploadImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const urls = await uploadInventoryImages(req.files);
    res.status(201).json({ urls });
  } catch (err) {
    next(err);
  }
}

// GET /api/inventory — public: browse catalog. Admin/staff get inactive items too.
async function getInventory(req, res, next) {
  try {
    const { search = "", category, gender, frameShape, page = 1, limit = 20 } = req.query;
    const isStaffOrAdmin = req.user && ["admin", "staff"].includes(req.user.role);

    const filter = isStaffOrAdmin ? {} : { isActive: true };
    if (search) filter.$text = { $search: search };
    if (category) filter.category = category;
    if (gender) filter.gender = gender;
    if (frameShape) filter.frameShape = frameShape;

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

    const before = await Inventory.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Item not found" });

    const previousImages = before.images || [];

    const item = await Inventory.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after",
      runValidators: true,
    });

    await logAudit({
      entityType: "Inventory",
      entityId: item._id,
      action: "update",
      user: req.user,
      summary: `Inventory item updated: ${item.sku} — ${item.name}`,
    });

    // Clean up any photos that were removed in this edit — otherwise they'd
    // sit in Blob Storage forever, invisible and quietly costing money.
    const removedImages = previousImages.filter((url) => !(item.images || []).includes(url));
    if (removedImages.length > 0) {
      deleteInventoryImages(removedImages).catch(() => {});
    }

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

    if (item.images && item.images.length > 0) {
      deleteInventoryImages(item.images).catch(() => {});
    }

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
  uploadImages,
};

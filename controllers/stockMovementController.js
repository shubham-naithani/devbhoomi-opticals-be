const StockMovement = require("../models/StockMovement");

// GET /api/stock-movements (admin only) — unified history across all
// products, filterable by article, type, and date range.
async function getStockMovements(req, res, next) {
  try {
    const { articleId, inventoryItem, type, search, from, to, page = 1, limit = 30 } = req.query;
    const filter = {};

    if (articleId) filter.articleId = articleId;
    if (inventoryItem) filter.inventoryItem = inventoryItem;
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { productName: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate("performedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StockMovement.countDocuments(filter),
    ]);

    res.json({ movements, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStockMovements };
const Transaction = require("../models/Transaction");
const Order = require("../models/Order");

// GET /api/transactions (admin only) — paginated ledger, filterable by
// type and date range. This is the raw audit trail: every payment and
// refund, individually, not aggregated.
async function getTransactions(req, res, next) {
  try {
    const { type, from, to, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    if (search) {
      // Transaction doesn't store order info directly — find matching
      // orders first (same fields Orders page already searches by), then
      // narrow the ledger to just their transactions.
      const matchingOrders = await Order.find({
        $or: [
          { orderId: { $regex: search, $options: "i" } },
          { contactPhone: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      filter.order = { $in: matchingOrders.map((o) => o._id) };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate({ path: "order", select: "orderId customer", populate: { path: "customer", select: "name phone" } })
        .populate("performedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Transaction.countDocuments(filter),
    ]);

    res.json({ transactions, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/pnl?from=&to= (admin only) — the actual P&L
// summary for an arbitrary date range: revenue (from the ledger, so
// cancelled/unpaid orders are naturally excluded), refunds, COGS (from
// order items' cost snapshots), and the resulting gross profit/margin.
async function getPnlSummary(req, res, next) {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // Revenue side — from the Transaction ledger, same source of truth
    // the dashboard already uses.
    const txMatch = hasDateFilter ? { createdAt: dateFilter } : {};
    const txSummary = await Transaction.aggregate([
      { $match: txMatch },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    const payments = txSummary.find((t) => t._id === "payment")?.total || 0;
    const refunds = txSummary.find((t) => t._id === "refund")?.total || 0;
    const revenue = payments - refunds;

    // Cost side — from order items' cost snapshots, for any order that
    // wasn't cancelled (stock stayed committed = a real sale happened).
    // Orders predating the costPrice snapshot contribute 0 for those
    // specific items (via $ifNull) — see caveat surfaced in the response.
    const orderMatch = { isDeleted: { $ne: true }, status: { $ne: "cancelled" } };
    if (hasDateFilter) orderMatch.createdAt = dateFilter;

    const [cogsResult] = await Order.aggregate([
      { $match: orderMatch },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          cogs: { $sum: { $multiply: [{ $ifNull: ["$items.costPrice", 0] }, "$items.quantity"] } },
          itemsMissingCost: {
            $sum: { $cond: [{ $eq: ["$items.costPrice", null] }, 1, 0] },
          },
        },
      },
    ]);

    const cogs = cogsResult?.cogs || 0;
    const itemsMissingCost = cogsResult?.itemsMissingCost || 0;
    const grossProfit = revenue - cogs;
    const grossMarginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0;

    res.json({
      revenue,
      refunds,
      payments,
      cogs,
      grossProfit,
      grossMarginPct,
      itemsMissingCost, // count of sold line-items with no cost snapshot — flags incomplete historical data
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTransactions, getPnlSummary };
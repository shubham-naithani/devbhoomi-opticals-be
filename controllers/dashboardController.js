const Order = require("../models/Order");
const Inventory = require("../models/Inventory");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { LOW_STOCK_THRESHOLD } = require("../jobs/lowStockCheck");

async function getDashboardStats(req, res, next) {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const baseMatch = { isDeleted: { $ne: true } };

    // ── Revenue: now sourced from Transaction, not Order.totalAmount ──
    // A "payment" transaction is real cash collected; a "refund" transaction
    // is real cash given back. Net = payment - refund, per period. Cancelled
    // orders that were never paid simply never generated a payment
    // transaction, so they're excluded automatically — no status filtering
    // needed here.
    const [txSummary] = await Transaction.aggregate([
      {
        $facet: {
          today: [
            { $match: { createdAt: { $gte: startOfToday } } },
            { $group: { _id: "$type", total: { $sum: "$amount" } } },
          ],
          week: [
            { $match: { createdAt: { $gte: startOfWeek } } },
            { $group: { _id: "$type", total: { $sum: "$amount" } } },
          ],
          month: [
            { $match: { createdAt: { $gte: startOfMonth } } },
            { $group: { _id: "$type", total: { $sum: "$amount" } } },
          ],
        },
      },
    ]);

    function netRevenue(bucket) {
      const payment = bucket.find((b) => b._id === "payment")?.total || 0;
      const refund = bucket.find((b) => b._id === "refund")?.total || 0;
      return { revenue: payment - refund, refunded: refund };
    }

    // Order counts per period (separate from money — just "how many orders
    // were placed", regardless of payment status) so the cards can still
    // show "N orders" alongside the revenue figure.
    const [orderCounts] = await Order.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          today: [{ $match: { createdAt: { $gte: startOfToday } } }, { $count: "count" }],
          week: [{ $match: { createdAt: { $gte: startOfWeek } } }, { $count: "count" }],
          month: [{ $match: { createdAt: { $gte: startOfMonth } } }, { $count: "count" }],
          bySource: [
            { $match: { createdAt: { $gte: startOfMonth } } },
            { $group: { _id: "$source", orders: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const countOf = (bucket) => bucket[0]?.count || 0;

    // ── Order status breakdown (all-time, non-deleted) ──
    const statusBreakdown = await Order.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // ── Top 5 products by units sold (last 30 days) ──
    const topProducts = await Order.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: thirtyDaysAgo } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          unitsSold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: 5 },
    ]);

    // ── 7-day revenue trend (kept on Transaction too, so the chart matches
    // the same "real cash" definition as the summary cards) ──
    const revenueTrend = await Transaction.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          payments: { $sum: { $cond: [{ $eq: ["$type", "payment"] }, "$amount", 0] } },
          refunds: { $sum: { $cond: [{ $eq: ["$type", "refund"] }, "$amount", 0] } },
        },
      },
      { $project: { _id: 1, revenue: { $subtract: ["$payments", "$refunds"] } } },
      { $sort: { _id: 1 } },
    ]);

    // ── Recent orders ──
    const recentOrders = await Order.find(baseMatch)
      .sort({ createdAt: -1 })
      .limit(8)
      .select("orderId totalAmount status source createdAt paymentStatus refundStatus")
      .populate("customer", "name phone");

    // ── Existing counts ──
    const [totalUsers, totalInventory] = await Promise.all([
      User.countDocuments({}),
      Inventory.countDocuments({}),
    ]);

    const inventoryDocs = await Inventory.find({}, "articles name");
    const lowStockItems = [];
    inventoryDocs.forEach((doc) => {
      (doc.articles || []).forEach((a) => {
        const effectiveThreshold = a.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
        if (a.stock <= effectiveThreshold && a.isActive) {
          lowStockItems.push({ productId: doc._id, name: doc.name, sku: a.sku, stock: a.stock });
        }
      });
    });

    res.json({
      revenue: {
        today: { ...netRevenue(txSummary.today), orders: countOf(orderCounts.today) },
        week: { ...netRevenue(txSummary.week), orders: countOf(orderCounts.week) },
        month: { ...netRevenue(txSummary.month), orders: countOf(orderCounts.month) },
        bySource: orderCounts.bySource,
      },
      statusBreakdown,
      topProducts,
      revenueTrend,
      recentOrders,
      totalUsers,
      totalInventory,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboardStats };
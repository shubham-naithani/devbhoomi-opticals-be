const Order = require("../models/Order");
const Inventory = require("../models/Inventory");
const User = require("../models/User");

async function getDashboardStats(req, res, next) {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const baseMatch = { isDeleted: { $ne: true } };

    // Revenue buckets (today/week/month) + walk-in vs online split
    const [revenueBuckets] = await Order.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          today: [
            { $match: { createdAt: { $gte: startOfToday } } },
            { $group: { _id: null, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
          ],
          week: [
            { $match: { createdAt: { $gte: startOfWeek } } },
            { $group: { _id: null, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
          ],
          month: [
            { $match: { createdAt: { $gte: startOfMonth } } },
            { $group: { _id: null, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
          ],
          bySource: [
            { $match: { createdAt: { $gte: startOfMonth } } },
            { $group: { _id: "$source", revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
          ],
        },
      },
    ]);

    // Order status breakdown (all-time, non-deleted)
    const statusBreakdown = await Order.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Top 5 products by units sold (last 30 days)
    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
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

    // 7-day revenue trend
    const revenueTrend = await Order.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Recent orders
    const recentOrders = await Order.find(baseMatch)
      .sort({ createdAt: -1 })
      .limit(8)
      .select("orderId totalAmount status source createdAt paymentStatus")
      .populate("customer", "name phone");

    // Existing counts
    const [totalUsers, totalInventory] = await Promise.all([
      User.countDocuments({}),
      Inventory.countDocuments({}),
    ]);

    const inventoryDocs = await Inventory.find({}, "articles");
    const lowStockItems = [];
    inventoryDocs.forEach((doc) => {
      (doc.articles || []).forEach((a) => {
        if (a.stock <= 5 && a.isActive) {
          lowStockItems.push({ productId: doc._id, name: doc.name, sku: a.sku, stock: a.stock });
        }
      });
    });

    res.json({
      revenue: {
        today: revenueBuckets.today[0] || { revenue: 0, orders: 0 },
        week: revenueBuckets.week[0] || { revenue: 0, orders: 0 },
        month: revenueBuckets.month[0] || { revenue: 0, orders: 0 },
        bySource: revenueBuckets.bySource,
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
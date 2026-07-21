const Inventory = require("../models/Inventory");
const { notifyLowStock } = require("../services/whatsappService");

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 5;

// Shared by both the daily cron job and the manual admin-triggered
// endpoint — one place computing "what counts as low stock" so the
// dashboard, this alert, and any future feature all agree on the number.
async function findLowStockArticles() {
  const products = await Inventory.find({ isActive: true }, "name articles");
  const lowStock = [];

  products.forEach((product) => {
    (product.articles || []).forEach((article) => {
      const effectiveThreshold = article.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
      if (article.isActive && article.stock <= effectiveThreshold) {
        lowStock.push({ name: `${product.name} (${article.sku})`, stock: article.stock });
      }
    });
  });

  return lowStock;
}

async function runLowStockCheck() {
  const lowStock = await findLowStockArticles();
  if (lowStock.length === 0) {
    console.log("[LowStockCheck] Nothing low today.");
    return { checked: true, count: 0 };
  }

  await notifyLowStock(lowStock);
  console.log(`[LowStockCheck] Sent alert for ${lowStock.length} low-stock item(s).`);
  return { checked: true, count: lowStock.length, items: lowStock };
}

module.exports = { runLowStockCheck, findLowStockArticles, LOW_STOCK_THRESHOLD };
const StockMovement = require("../models/StockMovement");

async function logStockMovement(
  { inventoryItem, articleId, sku, productName, type, quantityChange, previousStock, newStock, reason, referenceType, referenceId, performedBy },
  session
) {
  const docs = await StockMovement.create(
    [
      {
        inventoryItem,
        articleId,
        sku,
        productName,
        type,
        quantityChange,
        previousStock,
        newStock,
        reason,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
        performedBy,
      },
    ],
    session ? { session } : {}
  );
  return docs[0];
}

module.exports = { logStockMovement };
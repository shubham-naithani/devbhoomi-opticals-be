const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");
const PurchaseRecord = require("../models/PurchaseRecord");
const { generatePurchaseId } = require("../utils/humanId");
const { calculateMrp, calculateMsp } = require("../utils/pricing");
const { logAudit } = require("../utils/auditLogger");
const { logStockMovement } = require("../utils/stockMovementLogger");

// POST /api/purchases (admin only)
// Body: { supplierName, invoiceNumber?, invoiceDate, items: [{ inventoryItem, articleId, quantity, unitCost }], notes? }
async function createPurchaseRecord(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { supplierName, invoiceNumber, invoiceDate, items, notes } = req.body;

    if (!supplierName || !supplierName.trim()) {
      return res.status(400).json({ message: "Supplier name is required" });
    }
    if (!invoiceDate) {
      return res.status(400).json({ message: "Invoice date is required" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Add at least one item received" });
    }

    let createdRecord;
    let totalAmount = 0;
    const purchaseItems = [];

    await session.withTransaction(async () => {
      for (const line of items) {
        const product = await Inventory.findById(line.inventoryItem).session(session);
        if (!product) {
          throw Object.assign(new Error(`Product not found for one of the items`), { statusCode: 400 });
        }
        const article = product.articles.id(line.articleId);
        if (!article) {
          throw Object.assign(new Error(`Variant not found on "${product.name}"`), { statusCode: 400 });
        }

        const quantity = Number(line.quantity);
        const unitCost = Number(line.unitCost);
        if (!quantity || quantity <= 0) {
          throw Object.assign(new Error(`Invalid quantity for "${product.name}"`), { statusCode: 400 });
        }
        if (unitCost === undefined || unitCost === null || isNaN(unitCost) || unitCost < 0) {
          throw Object.assign(new Error(`Invalid unit cost for "${product.name}"`), { statusCode: 400 });
        }

        // This is the moment the article's real cost basis changed — update
        // it live, same recalculation rule as editing an article directly:
        // MRP always follows cost; MSP only if it hasn't been manually
        // overridden.
        article.stock += quantity;
        article.costPrice = unitCost;
        article.price = calculateMrp(unitCost);
        if (!article.isMspManual) {
          article.mspPrice = calculateMsp(unitCost);
        }
        await product.save({ session });
        await logStockMovement(
          {
            inventoryItem: product._id,
            articleId: article._id,
            sku: article.sku,
            productName: product.name,
            type: "purchase_in",
            quantityChange: quantity,
            previousStock: article.stock - quantity,
            newStock: article.stock,
            referenceType: "PurchaseRecord",
            performedBy: req.user._id,
          },
          session,
        );

        const lineName = `${product.name} — ${[article.color, article.lensTint, article.size].filter(Boolean).join(" / ") || "Standard"}`;
        purchaseItems.push({
          inventoryItem: product._id,
          articleId: article._id,
          name: lineName,
          quantity,
          unitCost,
        });
        totalAmount += quantity * unitCost;
      }

      const purchaseId = await generatePurchaseId();
      const docs = await PurchaseRecord.create(
        [
          {
            purchaseId,
            supplierName: supplierName.trim(),
            invoiceNumber: invoiceNumber || undefined,
            invoiceDate: new Date(invoiceDate),
            items: purchaseItems,
            totalAmount,
            notes,
            createdBy: req.user._id,
          },
        ],
        { session }
      );
      createdRecord = docs[0];
    });

    await logAudit({
      entityType: "Inventory",
      entityId: createdRecord._id,
      action: "create",
      user: req.user,
      summary: `Stock received: ${createdRecord.purchaseId} from ${createdRecord.supplierName} (${purchaseItems.length} item type(s), ₹${totalAmount})`,
    });

    res.status(201).json({ purchaseRecord: createdRecord });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// GET /api/purchases (admin only) — paginated list, filterable
async function getPurchaseRecords(req, res, next) {
  try {
    const { search, from, to, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { purchaseId: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } },
        { invoiceNumber: { $regex: search, $options: "i" } },
      ];
    }
    if (from || to) {
      filter.invoiceDate = {};
      if (from) filter.invoiceDate.$gte = new Date(from);
      if (to) filter.invoiceDate.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      PurchaseRecord.find(filter)
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      PurchaseRecord.countDocuments(filter),
    ]);

    res.json({ records, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/purchases/:id (admin only)
async function getPurchaseRecordById(req, res, next) {
  try {
    const record = await PurchaseRecord.findById(req.params.id).populate("createdBy", "name");
    if (!record) return res.status(404).json({ message: "Purchase record not found" });
    res.json({ purchaseRecord: record });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPurchaseRecord, getPurchaseRecords, getPurchaseRecordById };
const Inventory = require("../models/Inventory");
const { generateInventorySku, generateBarcode } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");
const { uploadInventoryImages, deleteInventoryImages } = require("../services/blobStorageService");
const { calculateMrp, calculateMsp } = require("../utils/pricing");
const Brand = require("../models/Brand");
const { runLowStockCheck } = require("../jobs/lowStockCheck");

async function triggerLowStockCheck(req, res, next) {
  try {
    const result = await runLowStockCheck();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Ensures a brand name is registered in the Brand collection whenever it's
// used on a product — so the brand persists independently of any single
// product's lifecycle (e.g. surviving that product later being deleted).
async function ensureBrandExists(name) {
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  await Brand.updateOne(
    { name: { $regex: `^${trimmed}$`, $options: "i" } },
    { $setOnInsert: { name: trimmed } },
    { upsert: true }
  );
}

// GET /api/inventory — public: browse products. Admin/staff get inactive
// products too. `search` matches name/brand (text index) OR a specific
// article's SKU (regex, since SKUs like "EYG-000045" need exact/prefix
// matching that a text index doesn't handle well).
async function getInventory(req, res, next) {
  try {
    const { search = "", category, gender, frameShape, brand, page = 1, limit = 20 } = req.query;
    const isStaffOrAdmin = req.user && ["admin", "staff"].includes(req.user.role);

    const filter = isStaffOrAdmin ? {} : { isActive: true };
    if (category) filter.category = category;
    if (gender) filter.gender = gender;
    if (frameShape) filter.frameShape = frameShape;
    if (brand) filter.brand = { $regex: `^${brand}$`, $options: "i" };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { "articles.sku": { $regex: search, $options: "i" } },
        { "articles.barcode": { $regex: search, $options: "i" } },
      ];
    }

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

// GET /api/inventory/brands — merges brands seeded ahead of time (Brand
// collection) with brands already in use on real products, so the
// autocomplete works whether or not inventory exists yet for a brand.
async function getBrands(req, res, next) {
  try {
    const [productBrands, seededBrands] = await Promise.all([
      Inventory.distinct("brand", { isActive: true }),
      Brand.distinct("name"),
    ]);
    const merged = new Set([...productBrands, ...seededBrands].filter(Boolean));
    res.json({ brands: [...merged].sort() });
  } catch (err) {
    next(err);
  }
}

// POST /api/inventory/brands (admin only) — add a brand name ahead of any
// product using it.
async function addBrand(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Brand name is required" });
    }
    const trimmed = name.trim();

    const existing = await Brand.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
    if (existing) {
      return res.status(400).json({ message: "This brand already exists" });
    }

    const brand = await Brand.create({ name: trimmed });
    res.status(201).json({ brand });
  } catch (err) {
    next(err);
  }
}

// GET /api/inventory/barcode/:barcode (admin/staff) — the core of the
// scan-first workflow: a scanner "types" the decoded barcode + Enter into
// a focused input, which fires this exact-match lookup and returns the
// specific Product + Article to add to the order/cart immediately.
async function getArticleByBarcode(req, res, next) {
  try {
    const { barcode } = req.params;
    const product = await Inventory.findOne({ "articles.barcode": barcode });
    if (!product) {
      return res.status(404).json({ message: "No item found for this barcode" });
    }

    const article = product.articles.find((a) => a.barcode === barcode);
    res.json({ item: product, article });
  } catch (err) {
    next(err);
  }
}

// GET /api/inventory/brands/:brand/defaults (admin/staff) — computes the
// most common category/frameType/gender among this brand's EXISTING
// products, purely from real data. No hardcoded brand mapping anywhere —
// this is what makes it safe to later swap for a real Configuration module
// (a Brand collection with explicit defaultCategory etc.) without any
// frontend change: same endpoint shape, just a different data source.
async function getBrandDefaults(req, res, next) {
  try {
    const { brand } = req.params;
    const products = await Inventory.find(
      { brand: { $regex: `^${brand}$`, $options: "i" } },
      "category frameType gender"
    );

    if (products.length === 0) {
      return res.json({ defaults: null });
    }

    function mostCommon(values) {
      const counts = {};
      let best = null;
      let bestCount = 0;
      for (const v of values) {
        if (!v) continue;
        counts[v] = (counts[v] || 0) + 1;
        if (counts[v] > bestCount) {
          bestCount = counts[v];
          best = v;
        }
      }
      return best;
    }

    res.json({
      defaults: {
        category: mostCommon(products.map((p) => p.category)),
        frameType: mostCommon(products.map((p) => p.frameType)),
        gender: mostCommon(products.map((p) => p.gender)),
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/inventory (admin only) — creates a product together with its
// first article/variant in one request, matching the existing "add item"
// form UX (further variants are added afterward via addArticle).
// Body: { name, brand, category, ..., article: { color, price, stock, ... } }
async function createInventory(req, res, next) {
  try {
    const { name, article, ...productFields } = req.body;
    if (!name) return res.status(400).json({ message: "Product name is required" });
    if (!article || article.costPrice === undefined || article.costPrice === null) {
      return res.status(400).json({ message: "At least one article with a cost price is required" });
    }

    const sku = await generateInventorySku(productFields.category);
    const barcode = await generateBarcode();
    const costPrice = Number(article.costPrice);

    // MRP is always derived — any `price` the client sent is ignored.
    // MSP: if the client explicitly supplied mspPrice, that's a manual
    // override recorded as such; otherwise it's auto-derived from cost.
    const isMspManual = article.mspPrice !== undefined && article.mspPrice !== null;
    const mspPrice = isMspManual ? Number(article.mspPrice) : calculateMsp(costPrice);

    const item = await Inventory.create({
      name,
      ...productFields,
      articles: [
        {
          ...article,
          sku,
          barcode,
          barcodeGeneratedAt: new Date(),
          costPrice,
          price: calculateMrp(costPrice),
          mspPrice,
          isMspManual,
        },
      ],
    });
    await ensureBrandExists(item.brand);

    await logAudit({
      entityType: "Inventory",
      entityId: item._id,
      action: "create",
      user: req.user,
      summary: `Product created: ${item.name} (first article ${sku}, barcode ${barcode})`,
    });

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

// PUT /api/inventory/:id (admin only) — product-level fields only.
// Articles are never edited here — use the dedicated article endpoints —
// so a stray `articles` key in the payload is always ignored.
async function updateInventory(req, res, next) {
  try {
    const { articles, ...updates } = req.body;

    const item = await Inventory.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: "Item not found" });

    await ensureBrandExists(item.brand);
    
    await logAudit({
      entityType: "Inventory",
      entityId: item._id,
      action: "update",
      user: req.user,
      summary: `Product updated: ${item.name}`,
    });

    res.json({ item });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/inventory/:id (admin only) — deletes the product and every
// one of its articles, cleaning up all their photos from Blob Storage.
async function deleteInventory(req, res, next) {
  try {
    const item = await Inventory.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    await logAudit({
      entityType: "Inventory",
      entityId: item._id,
      action: "delete",
      user: req.user,
      summary: `Product deleted: ${item.name} (${item.articles.length} article(s))`,
    });

    const allImages = item.articles.flatMap((a) => a.images || []);
    if (allImages.length > 0) deleteInventoryImages(allImages).catch(() => {});

    res.json({ message: "Product deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
}

// POST /api/inventory/:id/articles (admin only) — add a new variant to an
// existing product (e.g., the same Aviator model in a new color).
async function addArticle(req, res, next) {
  try {
    const product = await Inventory.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (req.body.costPrice === undefined || req.body.costPrice === null) {
      return res.status(400).json({ message: "Cost price is required" });
    }

    const sku = await generateInventorySku(product.category);
    const barcode = await generateBarcode();
    const costPrice = Number(req.body.costPrice);
    const isMspManual = req.body.mspPrice !== undefined && req.body.mspPrice !== null;
    const mspPrice = isMspManual ? Number(req.body.mspPrice) : calculateMsp(costPrice);

    product.articles.push({
      ...req.body,
      sku,
      barcode,
      barcodeGeneratedAt: new Date(),
      costPrice,
      price: calculateMrp(costPrice),
      mspPrice,
      isMspManual,
    });
    await product.save();

    await logAudit({
      entityType: "Inventory",
      entityId: product._id,
      action: "update",
      user: req.user,
      summary: `Article added to ${product.name}: ${sku} (barcode ${barcode})`,
    });

    res.status(201).json({ item: product });
  } catch (err) {
    next(err);
  }
}

// PUT /api/inventory/:id/articles/:articleId (admin only)
async function updateArticle(req, res, next) {
  try {
    // sku, barcode, barcodeGeneratedAt: immutable once assigned.
    // price: never client-settable — MRP is always server-derived.
    const { sku, barcode, barcodeGeneratedAt, price, ...updates } = req.body;

    const product = await Inventory.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const article = product.articles.id(req.params.articleId);
    if (!article) return res.status(404).json({ message: "Article not found" });

    const previousImages = [...(article.images || [])];

    // Resolve the effective cost after this update, and the resulting
    // MSP override state, BEFORE applying the raw update — so we can
    // compute final derived values afterward regardless of what the
    // client's payload happened to contain.
    const newCostPrice = updates.costPrice !== undefined ? Number(updates.costPrice) : article.costPrice;

    let isMspManual = article.isMspManual;
    let mspPrice = article.mspPrice;

    if (updates.mspPrice !== undefined && updates.mspPrice !== null) {
      // Client explicitly set an MSP value — treat as a manual override.
      mspPrice = Number(updates.mspPrice);
      isMspManual = true;
    } else if (updates.isMspManual === false) {
      // Explicit reset-to-auto action — clear the override.
      isMspManual = false;
    }

    Object.assign(article, updates);

    if (newCostPrice !== undefined && newCostPrice !== null) {
      article.costPrice = newCostPrice;
      article.price = calculateMrp(newCostPrice); // MRP always overwritten — read-only, derived
      if (!isMspManual) {
        mspPrice = calculateMsp(newCostPrice);
      }
    }

    article.mspPrice = mspPrice;
    article.isMspManual = isMspManual;

    await product.save();

    await logAudit({
      entityType: "Inventory",
      entityId: product._id,
      action: "update",
      user: req.user,
      summary: `Article updated on ${product.name}: ${article.sku}`,
    });

    const removedImages = previousImages.filter((url) => !(article.images || []).includes(url));
    if (removedImages.length > 0) deleteInventoryImages(removedImages).catch(() => {});

    res.json({ item: product });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/inventory/:id/articles/:articleId (admin only)
async function deleteArticle(req, res, next) {
  try {
    const product = await Inventory.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const article = product.articles.id(req.params.articleId);
    if (!article) return res.status(404).json({ message: "Article not found" });

    if (product.articles.length <= 1) {
      return res.status(400).json({
        message: "Can't delete the last article — delete the whole product instead if it's no longer sold",
      });
    }

    const images = [...(article.images || [])];
    const sku = article.sku;
    article.deleteOne();
    await product.save();

    await logAudit({
      entityType: "Inventory",
      entityId: product._id,
      action: "delete",
      user: req.user,
      summary: `Article deleted from ${product.name}: ${sku}`,
    });

    if (images.length > 0) deleteInventoryImages(images).catch(() => {});

    res.json({ item: product });
  } catch (err) {
    next(err);
  }
}

// POST /api/inventory/upload-images (admin only) — unchanged: uploads raw
// files to Blob Storage and returns their URLs, used when adding/editing
// any article's photos.
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

// PUT /api/inventory/bulk/status (admin only) — bulk activate/deactivate.
// Body: { ids: [...], isActive: true|false }
async function bulkUpdateInventoryStatus(req, res, next) {
  try {
    const { ids, isActive } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Provide at least one product id" });
    }
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be true or false" });
    }

    const products = await Inventory.find({ _id: { $in: ids } }, "name");
    if (products.length === 0) {
      return res.status(404).json({ message: "No matching products found" });
    }

    await Inventory.updateMany({ _id: { $in: ids } }, { $set: { isActive } });

    await Promise.all(
      products.map((p) =>
        logAudit({
          entityType: "Inventory",
          entityId: p._id,
          action: "update",
          user: req.user,
          summary: `Bulk ${isActive ? "activated" : "deactivated"}: ${p.name}`,
        })
      )
    );

    res.json({ message: `${products.length} product(s) updated`, updatedCount: products.length });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/inventory/bulk (admin only) — bulk delete products + their images.
// Body: { ids: [...] }
async function bulkDeleteInventory(req, res, next) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Provide at least one product id" });
    }

    const products = await Inventory.find({ _id: { $in: ids } });
    if (products.length === 0) {
      return res.status(404).json({ message: "No matching products found" });
    }

    await Inventory.deleteMany({ _id: { $in: ids } });

    const allImages = products.flatMap((p) => p.articles.flatMap((a) => a.images || []));
    if (allImages.length > 0) deleteInventoryImages(allImages).catch(() => {});

    await Promise.all(
      products.map((p) =>
        logAudit({
          entityType: "Inventory",
          entityId: p._id,
          action: "delete",
          user: req.user,
          summary: `Bulk deleted: ${p.name} (${p.articles.length} article(s))`,
        })
      )
    );

    res.json({ message: `${products.length} product(s) deleted`, deletedCount: products.length });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getInventory,
  getInventoryById,
  getBrands,
  addBrand,
  getArticleByBarcode,
  getBrandDefaults,
  createInventory,
  updateInventory,
  deleteInventory,
  addArticle,
  updateArticle,
  deleteArticle,
  uploadImages,
  triggerLowStockCheck,
  bulkUpdateInventoryStatus,
  bulkDeleteInventory
};

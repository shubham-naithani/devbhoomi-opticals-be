const Inventory = require("../models/Inventory");
const { generateInventorySku, generateBarcode } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");
const { uploadInventoryImages, deleteInventoryImages } = require("../services/blobStorageService");

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

// GET /api/inventory/brands — distinct brand list, used to power "more from
// this brand" links and any brand filter dropdown.
async function getBrands(req, res, next) {
  try {
    const brands = await Inventory.distinct("brand", { isActive: true });
    res.json({ brands: brands.filter(Boolean).sort() });
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

// POST /api/inventory (admin only) — creates a product together with its
// first article/variant in one request, matching the existing "add item"
// form UX (further variants are added afterward via addArticle).
// Body: { name, brand, category, ..., article: { color, price, stock, ... } }
async function createInventory(req, res, next) {
  try {
    const { name, article, ...productFields } = req.body;
    if (!name) return res.status(400).json({ message: "Product name is required" });
    if (!article || article.price === undefined) {
      return res.status(400).json({ message: "At least one article with a price is required" });
    }

    const sku = await generateInventorySku(productFields.category);
    const barcode = await generateBarcode();
    const item = await Inventory.create({
      name,
      ...productFields,
      articles: [{ ...article, sku, barcode, barcodeGeneratedAt: new Date() }],
    });

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

    if (req.body.price === undefined) {
      return res.status(400).json({ message: "Price is required" });
    }

    const sku = await generateInventorySku(product.category);
    const barcode = await generateBarcode();
    product.articles.push({ ...req.body, sku, barcode, barcodeGeneratedAt: new Date() });
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
    const { sku, barcode, barcodeGeneratedAt, ...updates } = req.body; // SKU is immutable once assigned

    const product = await Inventory.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const article = product.articles.id(req.params.articleId);
    if (!article) return res.status(404).json({ message: "Article not found" });

    const previousImages = [...(article.images || [])];
    Object.assign(article, updates);
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

module.exports = {
  getInventory,
  getInventoryById,
  getBrands,
  getArticleByBarcode,
  createInventory,
  updateInventory,
  deleteInventory,
  addArticle,
  updateArticle,
  deleteArticle,
  uploadImages,
};

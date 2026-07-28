const Inventory = require("../models/Inventory");
const Order = require("../models/Order");
const RepairTicket = require("../models/RepairTicket");
const User = require("../models/User");
const { generateRepairId } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");
const { notifyRepairCreated, notifyRepairStatusChanged } = require("../services/whatsappService");

const STATUS_TRANSITIONS = {
  received: ["in_progress", "cancelled"],
  in_progress: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["collected", "cancelled"],
  collected: [],
  cancelled: [],
};
const ALL_STATUSES = Object.keys(STATUS_TRANSITIONS);

// GET /api/repairs/lookup?customerId=X&barcode=Y (admin/staff)
// Scans a barcode, resolves it to a product+article, then searches THIS
// customer's past orders for a matching purchase — so warranty/purchase
// date can be auto-detected before a ticket is even created.
// Returns candidate matches; if more than one, frontend lets staff pick.
async function lookupForRepair(req, res, next) {
  try {
    const { customerId, barcode } = req.query;
    if (!customerId || !barcode) {
      return res.status(400).json({ message: "customerId and barcode are required" });
    }

    const product = await Inventory.findOne({ "articles.barcode": barcode });
    if (!product) {
      return res.status(404).json({ message: "No item found for this barcode" });
    }
    const article = product.articles.find((a) => a.barcode === barcode);

    // Search this customer's non-deleted orders for a line item matching
    // this exact article — oldest-first isn't needed, we want every match
    // so multiple purchases of the same variant can be disambiguated.
    const matchingOrders = await Order.find({
      customer: customerId,
      isDeleted: { $ne: true },
      "items.articleId": article._id,
    }).sort({ createdAt: -1 });

    const candidates = matchingOrders.map((order) => {
      const item = order.items.find((i) => String(i.articleId) === String(article._id));
      return {
        orderId: order._id,
        orderNumber: order.orderId,
        purchaseDate: order.createdAt,
        warrantyMonths: item.warrantyMonths || 0,
      };
    });

    res.json({
      item: product,
      article,
      itemName: `${product.name} — ${article.color || ""} ${article.lensTint || ""} ${article.size || ""}`.replace(/\s+/g, " ").trim(),
      candidates, // [] if no match found — frontend treats this as "unverified" path
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/repairs (admin/staff)
// Body: { customerId, inventoryItem, articleId, itemName, linkedOrderId?,
//         purchaseDate?, warrantyMonths?, issueDescription, staffNotes?,
//         feeAmount?, feeCollected?, paymentMethod? }
// linkedOrderId/purchaseDate/warrantyMonths are all optional — omitted
// entirely means "unverified" (no matching purchase found), still allowed.
async function createRepairTicket(req, res, next) {
  try {
    const {
      customerId,
      inventoryItem,
      articleId,
      itemName,
      linkedOrderId,
      purchaseDate,
      warrantyMonths,
      issueDescription,
      staffNotes,
      feeAmount,
      feeCollected,
      paymentMethod,
    } = req.body;

    if (!customerId) return res.status(400).json({ message: "Customer is required" });
    if (!itemName || !itemName.trim()) return res.status(400).json({ message: "Item description is required" });
    if (!issueDescription || !issueDescription.trim()) {
      return res.status(400).json({ message: "Describe the issue before creating a repair ticket" });
    }

    const customer = await User.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const isUnverified = !linkedOrderId;

    // Warranty is computed ONCE here, at creation — not re-derived later,
    // so a ticket's warranty status stays stable even if store policy
    // changes afterward.
    let isUnderWarranty = false;
    if (!isUnverified && purchaseDate && warrantyMonths) {
      const cutoff = new Date(purchaseDate);
      cutoff.setMonth(cutoff.getMonth() + Number(warrantyMonths));
      isUnderWarranty = new Date() <= cutoff;
    }

    const repairId = await generateRepairId();

    const ticket = await RepairTicket.create({
      repairId,
      customer: customer._id,
      inventoryItem: inventoryItem || undefined,
      articleId: articleId || undefined,
      itemName: itemName.trim(),
      linkedOrderId: linkedOrderId || undefined,
      purchaseDate: purchaseDate || undefined,
      warrantyMonths: warrantyMonths || 0,
      isUnderWarranty,
      isUnverified,
      feeAmount: Number(feeAmount) || 0,
      feeCollected: !!feeCollected,
      paymentMethod: paymentMethod || undefined,
      issueDescription: issueDescription.trim(),
      staffNotes: staffNotes || undefined,
      createdBy: req.user._id,
    });

    await logAudit({
      entityType: "RepairTicket",
      entityId: ticket._id,
      action: "create",
      user: req.user,
      summary:
        `Repair ticket ${repairId} created for ${customer.name}: ${itemName}` +
        (isUnverified ? " (unverified — no matching purchase found)" : isUnderWarranty ? " — under warranty" : " — fee required"),
    });
    notifyRepairCreated(ticket, customer.phone).catch(() => {});

    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
}

// GET /api/repairs (admin/staff)
async function getAllRepairs(req, res, next) {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (search) filter.repairId = { $regex: search, $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      RepairTicket.find(filter)
        .populate("customer", "name phone")
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      RepairTicket.countDocuments(filter),
    ]);

    res.json({ tickets, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/repairs/:id (admin/staff)
async function getRepairById(req, res, next) {
  try {
    const ticket = await RepairTicket.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("customer", "name phone email")
      .populate("createdBy", "name")
      .populate("linkedOrderId", "orderId createdAt");
    if (!ticket) return res.status(404).json({ message: "Repair ticket not found" });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

// PUT /api/repairs/:id/status (admin/staff)
async function updateRepairStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!ALL_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${ALL_STATUSES.join(", ")}` });
    }

    const ticket = await RepairTicket.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("customer", "name phone");
    if (!ticket) return res.status(404).json({ message: "Repair ticket not found" });

    if (status === ticket.status) {
      return res.status(400).json({ message: `Ticket is already ${status}` });
    }

    const allowedNext = STATUS_TRANSITIONS[ticket.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        message: `Cannot move from "${ticket.status}" to "${status}". ${
          allowedNext.length ? `Allowed next step(s): ${allowedNext.join(", ")}` : `"${ticket.status}" is final — no further changes allowed`
        }`,
      });
    }

    ticket.status = status;
    await ticket.save();

    await logAudit({
      entityType: "RepairTicket",
      entityId: ticket._id,
      action: "update",
      user: req.user,
      summary: `Repair ticket ${ticket.repairId} status -> ${status}`,
    });

    const customerPhone = ticket.customer && ticket.customer.phone;
    notifyRepairStatusChanged(ticket, customerPhone).catch(() => {});

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

// PUT /api/repairs/:id (admin/staff) — edit fee/notes/payment, not item/customer
async function updateRepair(req, res, next) {
  try {
    const { staffNotes, feeAmount, feeCollected, paymentMethod } = req.body;

    const ticket = await RepairTicket.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!ticket) return res.status(404).json({ message: "Repair ticket not found" });

    if (staffNotes !== undefined) ticket.staffNotes = staffNotes;
    if (feeAmount !== undefined) ticket.feeAmount = Number(feeAmount) || 0;
    if (feeCollected !== undefined) ticket.feeCollected = !!feeCollected;
    if (paymentMethod !== undefined) ticket.paymentMethod = paymentMethod;

    await ticket.save();

    await logAudit({
      entityType: "RepairTicket",
      entityId: ticket._id,
      action: "update",
      user: req.user,
      summary: `Repair ticket ${ticket.repairId} details updated`,
    });

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/repairs/:id (admin only) — soft delete
async function deleteRepair(req, res, next) {
  try {
    const ticket = await RepairTicket.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!ticket) return res.status(404).json({ message: "Repair ticket not found" });

    ticket.isDeleted = true;
    ticket.deletedAt = new Date();
    ticket.deletedBy = req.user._id;
    await ticket.save();

    await logAudit({
      entityType: "RepairTicket",
      entityId: ticket._id,
      action: "delete",
      user: req.user,
      summary: `Repair ticket ${ticket.repairId} deleted (soft delete)`,
    });

    res.json({ message: "Repair ticket deleted", id: ticket._id });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  lookupForRepair,
  createRepairTicket,
  getAllRepairs,
  getRepairById,
  updateRepairStatus,
  updateRepair,
  deleteRepair,
};
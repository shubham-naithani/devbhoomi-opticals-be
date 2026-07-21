const mongoose = require("mongoose");
const Order = require("../models/Order");
const Inventory = require("../models/Inventory");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { generateOrderId } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");
const { logTransaction } = require("../utils/transactionLogger");
const { notifyOrderCreated, notifyOrderStatusChanged, notifyPaymentReceived } = require("../services/whatsappService");
const { SHIPPING_FEE } = require("../utils/pricing");

// Explicit state machine — Cancelled is reachable from every non-terminal
// status; Delivered and Cancelled are both terminal (no further transitions
// once reached). Enforced here so an invalid transition is rejected even if
// the frontend dropdown is bypassed and the API is hit directly.
const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
const ALL_STATUSES = Object.keys(STATUS_TRANSITIONS);

// Shared core: validates stock, decrements it, builds order line items —
// used by both the customer self-checkout and the admin walk-in flow so
// stock-safety logic only lives in one place.
// `items` here are { inventoryItem: <productId>, articleId, quantity }.
async function buildOrderItemsAndDeductStock(items, session) {
  let orderItems = [];
  let totalAmount = 0;

  for (const line of items) {
    const product = await Inventory.findById(line.inventoryItem).session(session);
    if (!product || !product.isActive) {
      throw Object.assign(new Error(`Item no longer available`), { statusCode: 400 });
    }

    const article = product.articles.id(line.articleId);
    if (!article || !article.isActive) {
      throw Object.assign(new Error(`Selected variant of "${product.name}" is no longer available`), {
        statusCode: 400,
      });
    }

    const quantity = Number(line.quantity) || 1;
    if (article.stock < quantity) {
      throw Object.assign(
        new Error(`Not enough stock for "${product.name}" (${describeArticle(article)}) — only ${article.stock} left`),
        { statusCode: 400 }
      );
    }

    article.stock -= quantity;
    await product.save({ session });

    orderItems.push({
      inventoryItem: product._id,
      articleId: article._id,
      name: `${product.name} — ${describeArticle(article)}`,
      price: article.price,
      costPrice: article.costPrice ?? undefined, // snapshot — may be missing on older articles without a cost set
      quantity,
    });
    totalAmount += article.price * quantity;
  }

  return { orderItems, totalAmount };
}

// Builds a short human label for a variant, e.g. "Black / Green lens / L".
// Falls back gracefully if only some attributes are set.
function describeArticle(article) {
  const parts = [article.color, article.lensTint, article.size].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Standard';
}

// Returns an order's items to stock. Guarded by stockRestored so this can
// never double-credit inventory, no matter which path (cancel or delete)
// triggers it, or in what order.
async function restockOrderItems(order, session) {
  if (order.stockRestored) return;

  for (const line of order.items) {
    const product = await Inventory.findById(line.inventoryItem).session(session);
    if (!product) continue; // product/article may have been deleted since — nothing to restock against
    const article = product.articles.id(line.articleId);
    if (!article) continue;

    article.stock += line.quantity;
    await product.save({ session });
  }
  order.stockRestored = true;
}

// POST /api/orders (logged-in customer, self-checkout, online)
async function createOrder(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { items, shippingAddress, contactPhone, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let createdOrder;

    await session.withTransaction(async () => {
      const { orderItems, totalAmount: itemsTotal } = await buildOrderItemsAndDeductStock(items, session);
      const orderId = await generateOrderId();

      const docs = await Order.create(
        [
          {
            orderId,
            customer: req.user._id,
            items: orderItems,
            totalAmount: itemsTotal + SHIPPING_FEE, // includes flat shipping — regardless of eventual payment method
            shippingCharge: SHIPPING_FEE,
            shippingAddress,
            contactPhone,
            notes,
            source: "online",
          },
        ],
        { session }
      );
      createdOrder = docs[0];
    });

    await logAudit({
      entityType: "Order",
      entityId: createdOrder._id,
      action: "create",
      user: req.user,
      summary: `Order ${createdOrder.orderId} placed online`,
    });

    notifyOrderCreated(createdOrder, req.user.phone).catch(() => {});

    res.status(201).json({ order: createdOrder });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// POST /api/orders/walk-in (admin/staff) — in-store order created on behalf of a customer
// Body: { customerId, items, paymentMethod, amountPaid?, prescriptionUsed?, notes? }
// amountPaid is optional — if omitted, the full total is assumed paid up front.
// Pass a smaller amountPaid to record a partial/advance payment instead.
async function createWalkInOrder(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { customerId, items, paymentMethod, amountPaid, prescriptionUsed, notes } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: "Customer is required" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Add at least one item to the order" });
    }

    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    let createdOrder;
    let changeDue = 0;
    let paidNow = 0;
    const method = paymentMethod || "cash";

    await session.withTransaction(async () => {
      const { orderItems, totalAmount } = await buildOrderItemsAndDeductStock(items, session);
      const orderId = await generateOrderId();

      // Default: fully paid at the counter. If the admin/staff entered a
      // smaller amountPaid, that's recorded as an advance/deposit instead.
      // If they entered MORE than the total (cash tendered exceeds the
      // bill), the excess is change owed back to the customer — the store
      // never "receives" more than the order total, so amountPaid is capped,
      // and the change amount is surfaced back to the caller instead of
      // silently disappearing.
      const rawAmount = amountPaid !== undefined && amountPaid !== null ? Number(amountPaid) : totalAmount;
      paidNow = Math.max(0, Math.min(rawAmount, totalAmount));
      changeDue = Math.max(rawAmount - totalAmount, 0);

      const docs = await Order.create(
        [
          {
            orderId,
            customer: customer._id,
            items: orderItems,
            totalAmount,
            amountPaid: paidNow,
            changeGiven: changeDue,
            paymentMethod: method,
            status: "confirmed", // in-person sale — no separate confirmation step needed
            source: "in_store",
            createdBy: req.user._id,
            prescriptionUsed: prescriptionUsed || undefined,
            contactPhone: customer.phone,
            notes,
          },
        ],
        { session }
      );
      createdOrder = docs[0];

      if (paidNow > 0) {
        await logTransaction(
          {
            orderId: createdOrder._id,
            type: "payment",
            amount: paidNow,
            method,
            performedBy: req.user._id,
            note: `Walk-in order ${orderId} — payment at creation`,
          },
          session
        );
      }
    });

    await logAudit({
      entityType: "Order",
      entityId: createdOrder._id,
      action: "create",
      user: req.user,
      summary:
        `Walk-in order ${createdOrder.orderId} created for ${customer.name} by ${req.user.name}` +
        (changeDue > 0 ? ` — Rs.${changeDue} change given` : ""),
    });

    notifyOrderCreated(createdOrder, customer.phone).catch(() => {});

    res.status(201).json({ order: createdOrder, changeDue });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// GET /api/orders/my (logged-in customer) — their own order history, paginated
async function getMyOrders(req, res, next) {
  try {
    const { page = 1, limit = 10 } = req.query;
    const filter = { customer: req.user._id, isDeleted: { $ne: true } };
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/orders (admin/staff) — all orders, optionally filtered by status/source
async function getAllOrders(req, res, next) {
  try {
    const { status, source, search, page = 1, limit = 20 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (search) {
      filter.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { contactPhone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("customer", "name email phone")
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/orders/:id (admin/staff) — full detail view for the "View" action
async function getOrderById(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("customer", "name email phone address")
      .populate("createdBy", "name")
      .populate("prescriptionUsed");

    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

// PUT /api/orders/:id/status (admin/staff)
async function updateOrderStatus(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { status } = req.body;
    if (!ALL_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${ALL_STATUSES.join(", ")}` });
    }

    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("customer", "name email phone")
      .populate("createdBy", "name");
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (status === order.status) {
      return res.status(400).json({ message: `Order is already ${status}` });
    }

    const allowedNext = STATUS_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        message: `Cannot move from "${order.status}" to "${status}". ${
          allowedNext.length
            ? `Allowed next step(s): ${allowedNext.join(", ")}`
            : `"${order.status}" is a final status — no further changes allowed`
        }`,
      });
    }

    await session.withTransaction(async () => {
      // Cancelling an order returns its items to stock — otherwise inventory
      // stays permanently short for a sale that never actually happened.
      if (status === "cancelled" && !order.stockRestored) {
        await restockOrderItems(order, session);
      }
      order.status = status;
      await order.save({ session });
    });

    await logAudit({
      entityType: "Order",
      entityId: order._id,
      action: "update",
      user: req.user,
      summary:
        `Order ${order.orderId} status -> ${status}` +
        (status === "cancelled" && order.amountPaid > 0
          ? ` — Rs.${order.amountPaid} was collected, refund not yet resolved`
          : ""),
    });

    const customerPhone = order.customer && order.customer.phone;
    notifyOrderStatusChanged(order, customerPhone).catch(() => {});

    const refundNeeded = status === "cancelled" && order.amountPaid > 0 && order.refundStatus !== "completed";

    res.json({ order, refundNeeded });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// PUT /api/orders/:id/payment (admin/staff) — record an additional payment
// against an order that was placed with a partial/advance amount.
// Body: { amount } — the amount received just now (not the new total paid).
async function recordPayment(req, res, next) {
  try {
    const { amount } = req.body;
    const addAmount = Number(amount);

    if (!addAmount || addAmount <= 0) {
      return res.status(400).json({ message: "Enter a valid payment amount" });
    }

    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("customer", "name phone")
      .populate("createdBy", "name");
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Only the portion that actually settles the remaining balance counts
    // as real revenue. Anything tendered beyond that is change handed back
    // immediately at the counter — same principle as createWalkInOrder —
    // so it must never be logged to the ledger.
    const remainingBalance = Math.max(order.totalAmount - order.amountPaid, 0);
    const appliedAmount = Math.min(addAmount, remainingBalance);
    const changeDue = Math.max(addAmount - remainingBalance, 0);

    order.amountPaid += appliedAmount; // never exceeds totalAmount
    if (changeDue > 0) order.changeGiven += changeDue;
    await order.save(); // pre-save hook recalculates paymentStatus

    if (appliedAmount > 0) {
      await logTransaction({
        orderId: order._id,
        type: "payment",
        amount: appliedAmount, // capped — not the raw addAmount
        method: order.paymentMethod,
        performedBy: req.user._id,
        note: `Additional payment on order ${order.orderId}`,
      });
    }

    await logAudit({
      entityType: "Order",
      entityId: order._id,
      action: "update",
      user: req.user,
      summary:
        `Payment of Rs.${addAmount} recorded on order ${order.orderId} (now ${order.paymentStatus})` +
        (changeDue > 0 ? ` — Rs.${changeDue} change given` : ""),
    });

    const customerPhone = order.customer && order.customer.phone;
    notifyPaymentReceived(order, addAmount, customerPhone).catch(() => {});

    res.json({ order, changeDue });
  } catch (err) {
    next(err);
  }
}

// PUT /api/orders/:id/refund (admin/staff) — resolve the refund on a
// cancelled (or soft-deleted) order that had money collected.
// Body: { mode: "now" | "pending", amount?, method?, note? }
// - mode "pending": acknowledges the refund is owed but hasn't happened yet.
// - mode "now": logs the actual refund transaction immediately.
// Works retroactively too — this isn't limited to the moment of cancelling,
// so an order that was cancelled before this feature existed can still be
// resolved by calling this once, whenever.
async function refundOrder(req, res, next) {
  try {
    const { mode, amount, method, note } = req.body;

    if (!["now", "pending"].includes(mode)) {
      return res.status(400).json({ message: `mode must be "now" or "pending"` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!(order.status === "cancelled" || order.isDeleted)) {
      return res.status(400).json({ message: "Refunds only apply to cancelled or deleted orders" });
    }
    if (order.amountPaid <= 0) {
      return res.status(400).json({ message: "No payment was collected on this order — nothing to refund" });
    }
    if (order.refundStatus === "completed") {
      return res.status(400).json({ message: "This order's refund has already been fully settled" });
    }

    if (mode === "pending") {
      order.refundStatus = "pending";
      await order.save();
      await logAudit({
        entityType: "Order",
        entityId: order._id,
        action: "update",
        user: req.user,
        summary: `Refund marked as pending on order ${order.orderId} (Rs.${order.amountPaid} owed)`,
      });
      return res.json({ order });
    }

    // mode === "now"
    const outstanding = order.amountPaid - order.refundedAmount;
    const refundAmount = amount !== undefined && amount !== null ? Number(amount) : outstanding;

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ message: "Enter a valid refund amount" });
    }
    if (refundAmount > outstanding) {
      return res.status(400).json({ message: `Refund amount exceeds outstanding balance of Rs.${outstanding}` });
    }

    await logTransaction({
      orderId: order._id,
      type: "refund",
      amount: refundAmount,
      method: method || order.paymentMethod,
      performedBy: req.user._id,
      note: note || `Refund for cancelled order ${order.orderId}`,
    });

    order.refundedAmount += refundAmount;
    order.refundedAt = new Date();
    // Only mark fully "completed" once the entire amountPaid has been
    // refunded — a partial refund leaves the order "pending" so the
    // remaining balance is still visible and actionable.
    order.refundStatus = order.refundedAmount >= order.amountPaid ? "completed" : "pending";
    await order.save();

    await logAudit({
      entityType: "Order",
      entityId: order._id,
      action: "update",
      user: req.user,
      summary:
        `Refund of Rs.${refundAmount} recorded on order ${order.orderId}` +
        (order.refundStatus === "pending"
          ? ` — Rs.${order.amountPaid - order.refundedAmount} still owed`
          : " — fully settled"),
    });

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

// PUT /api/orders/:id/settle-refund (admin/staff) — settle a refund that
// was previously marked "pending", once the cash actually goes back.
// Body: { amount?, method?, note? }
async function settleRefund(req, res, next) {
  try {
    const { amount, method, note } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.refundStatus !== "pending") {
      return res.status(400).json({ message: "This order has no pending refund to settle" });
    }

    const outstanding = order.amountPaid - order.refundedAmount;
    const refundAmount = amount !== undefined && amount !== null ? Number(amount) : outstanding;

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ message: "Enter a valid refund amount" });
    }
    if (refundAmount > outstanding) {
      return res.status(400).json({ message: `Refund amount exceeds outstanding balance of Rs.${outstanding}` });
    }

    await logTransaction({
      orderId: order._id,
      type: "refund",
      amount: refundAmount,
      method: method || order.paymentMethod,
      performedBy: req.user._id,
      note: note || `Refund settled for order ${order.orderId}`,
    });

    order.refundedAmount += refundAmount;
    order.refundedAt = new Date();
    order.refundStatus = order.refundedAmount >= order.amountPaid ? "completed" : "pending";
    await order.save();

    await logAudit({
      entityType: "Order",
      entityId: order._id,
      action: "update",
      user: req.user,
      summary:
        `Pending refund of Rs.${refundAmount} settled on order ${order.orderId}` +
        (order.refundStatus === "pending"
          ? ` — Rs.${order.amountPaid - order.refundedAmount} still owed`
          : " — fully settled"),
    });

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

// PUT /api/orders/:id (admin/staff) — edit order-level details.
// Deliberately does NOT allow changing items/customer — reconciling stock
// against an edited item list is a separate, riskier operation; the
// straightforward path for a genuine item mistake is to cancel (which
// restocks) and create a fresh order.
async function updateOrder(req, res, next) {
  try {
    const { notes, shippingAddress, contactPhone, paymentMethod } = req.body;

    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate("customer", "name email phone")
      .populate("createdBy", "name");
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (notes !== undefined) order.notes = notes;
    if (shippingAddress !== undefined) order.shippingAddress = shippingAddress;
    if (contactPhone !== undefined) order.contactPhone = contactPhone;
    if (paymentMethod !== undefined) order.paymentMethod = paymentMethod;

    await order.save();

    await logAudit({
      entityType: "Order",
      entityId: order._id,
      action: "update",
      user: req.user,
      summary: `Order ${order.orderId} details updated`,
    });

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/orders/:id (admin only) — soft delete. Returns items to stock
// (if not already returned via a prior cancellation) and hides the order
// from normal list views, but keeps the record and its audit trail intact.
async function deleteOrder(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!order) return res.status(404).json({ message: "Order not found" });

    await session.withTransaction(async () => {
      if (!order.stockRestored) {
        await restockOrderItems(order, session);
      }
      order.isDeleted = true;
      order.deletedAt = new Date();
      order.deletedBy = req.user._id;
      await order.save({ session });
    });

    await logAudit({
      entityType: "Order",
      entityId: order._id,
      action: "delete",
      user: req.user,
      summary:
        `Order ${order.orderId} deleted (soft delete)` +
        (order.amountPaid > 0 && order.refundStatus !== "completed"
          ? ` — Rs.${order.amountPaid} was collected, refund not yet resolved`
          : ""),
    });

    const refundNeeded = order.amountPaid > 0 && order.refundStatus !== "completed";

    res.json({ message: "Order deleted", id: order._id, refundNeeded });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// PUT /api/orders/bulk/status (admin/staff) — bulk status update. Since
// selected orders can each be in different states, this applies the
// change wherever it's a VALID transition and clearly reports what was
// skipped and why, rather than either failing everything or silently
// ignoring invalid ones.
// Body: { ids: [...], status: "in_progress" }
async function bulkUpdateOrderStatus(req, res, next) {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Provide at least one order id" });
    }
    if (!ALL_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${ALL_STATUSES.join(", ")}` });
    }

    const orders = await Order.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).populate(
      "customer",
      "name phone"
    );

    const updated = [];
    const skipped = [];

    for (const order of orders) {
      if (status === order.status) {
        skipped.push({ orderId: order.orderId, reason: `Already ${status}` });
        continue;
      }
      const allowedNext = STATUS_TRANSITIONS[order.status] || [];
      if (!allowedNext.includes(status)) {
        skipped.push({ orderId: order.orderId, reason: `Cannot move from "${order.status}" to "${status}"` });
        continue;
      }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          if (status === "cancelled" && !order.stockRestored) {
            await restockOrderItems(order, session);
          }
          order.status = status;
          await order.save({ session });
        });

        await logAudit({
          entityType: "Order",
          entityId: order._id,
          action: "update",
          user: req.user,
          summary: `Order ${order.orderId} status -> ${status} (bulk action)`,
        });

        const customerPhone = order.customer && order.customer.phone;
        notifyOrderStatusChanged(order, customerPhone).catch(() => {});

        updated.push(order.orderId);
      } finally {
        session.endSession();
      }
    }

    const foundIds = orders.map((o) => o._id.toString());
    const notFoundCount = ids.filter((id) => !foundIds.includes(id)).length;

    res.json({
      updated,
      skipped,
      notFoundCount,
      message: `${updated.length} order(s) updated${skipped.length ? `, ${skipped.length} skipped` : ""}`,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/orders/bulk (admin only) — bulk soft delete, same restock
// safety and refund-needed flagging as the single-order delete.
// Body: { ids: [...] }
async function bulkDeleteOrders(req, res, next) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Provide at least one order id" });
    }

    const orders = await Order.find({ _id: { $in: ids }, isDeleted: { $ne: true } });

    const deleted = [];
    const refundNeededOrderIds = [];

    for (const order of orders) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          if (!order.stockRestored) {
            await restockOrderItems(order, session);
          }
          order.isDeleted = true;
          order.deletedAt = new Date();
          order.deletedBy = req.user._id;
          await order.save({ session });
        });

        await logAudit({
          entityType: "Order",
          entityId: order._id,
          action: "delete",
          user: req.user,
          summary: `Order ${order.orderId} deleted (bulk action)`,
        });

        deleted.push(order.orderId);
        if (order.amountPaid > 0 && order.refundStatus !== "completed") {
          refundNeededOrderIds.push(order.orderId);
        }
      } finally {
        session.endSession();
      }
    }

    res.json({
      deleted,
      refundNeededOrderIds,
      message: `${deleted.length} order(s) deleted`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  createWalkInOrder,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  recordPayment,
  refundOrder,
  settleRefund,
  updateOrder,
  deleteOrder,
  bulkUpdateOrderStatus,
  bulkDeleteOrders, 
};
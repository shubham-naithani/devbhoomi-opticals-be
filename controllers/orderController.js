const mongoose = require("mongoose");
const Order = require("../models/Order");
const Inventory = require("../models/Inventory");
const User = require("../models/User");
const { generateOrderId } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");
const { notifyOrderCreated, notifyOrderStatusChanged, notifyPaymentReceived } = require("../services/whatsappService");

// Shared core: validates stock, decrements it, builds order line items —
// used by both the customer self-checkout and the admin walk-in flow so
// stock-safety logic only lives in one place.
async function buildOrderItemsAndDeductStock(items, session) {
  let orderItems = [];
  let totalAmount = 0;

  for (const line of items) {
    const product = await Inventory.findById(line.inventoryItem).session(session);
    if (!product || !product.isActive) {
      throw Object.assign(new Error(`Item no longer available`), { statusCode: 400 });
    }
    const quantity = Number(line.quantity) || 1;
    if (product.stock < quantity) {
      throw Object.assign(
        new Error(`Not enough stock for "${product.name}" (only ${product.stock} left)`),
        { statusCode: 400 }
      );
    }

    product.stock -= quantity;
    await product.save({ session });

    orderItems.push({
      inventoryItem: product._id,
      name: product.name,
      price: product.price,
      quantity,
    });
    totalAmount += product.price * quantity;
  }

  return { orderItems, totalAmount };
}

// Returns an order's items to stock. Guarded by stockRestored so this can
// never double-credit inventory, no matter which path (cancel or delete)
// triggers it, or in what order.
async function restockOrderItems(order, session) {
  if (order.stockRestored) return;

  for (const line of order.items) {
    await Inventory.findByIdAndUpdate(
      line.inventoryItem,
      { $inc: { stock: line.quantity } },
      { session }
    );
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
      const { orderItems, totalAmount } = await buildOrderItemsAndDeductStock(items, session);
      const orderId = await generateOrderId();

      const docs = await Order.create(
        [
          {
            orderId,
            customer: req.user._id,
            items: orderItems,
            totalAmount,
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
      const paidNow = Math.max(0, Math.min(rawAmount, totalAmount));
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
            paymentMethod: paymentMethod || "cash",
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
    const { status, source, page = 1, limit = 20 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (source) filter.source = source;

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
    const allowed = ["pending", "confirmed", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate(
      "customer",
      "name email phone"
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

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
      summary: `Order ${order.orderId} status -> ${status}`,
    });

    const customerPhone = order.customer && order.customer.phone;
    notifyOrderStatusChanged(order, customerPhone).catch(() => {});

    res.json({ order });
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

    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate(
      "customer",
      "name phone"
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    const newTotalPaid = order.amountPaid + addAmount;
    const changeDue = Math.max(newTotalPaid - order.totalAmount, 0);
    order.amountPaid = Math.min(newTotalPaid, order.totalAmount);
    if (changeDue > 0) order.changeGiven += changeDue;
    await order.save(); // pre-save hook recalculates paymentStatus

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

// PUT /api/orders/:id (admin/staff) — edit order-level details.
// Deliberately does NOT allow changing items/customer — reconciling stock
// against an edited item list is a separate, riskier operation; the
// straightforward path for a genuine item mistake is to cancel (which
// restocks) and create a fresh order.
async function updateOrder(req, res, next) {
  try {
    const { notes, shippingAddress, contactPhone, paymentMethod } = req.body;

    const order = await Order.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
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
      summary: `Order ${order.orderId} deleted (soft delete)`,
    });

    res.json({ message: "Order deleted", id: order._id });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
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
  updateOrder,
  deleteOrder,
};
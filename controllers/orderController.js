const mongoose = require("mongoose");
const Order = require("../models/Order");
const Inventory = require("../models/Inventory");
const User = require("../models/User");
const { generateOrderId } = require("../utils/humanId");
const { logAudit } = require("../utils/auditLogger");
const { notifyOrderCreated, notifyOrderStatusChanged } = require("../services/whatsappService");

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
// Body: { customerId, items, paymentMethod, prescriptionUsed?, notes? }
async function createWalkInOrder(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { customerId, items, paymentMethod, prescriptionUsed, notes } = req.body;

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

    await session.withTransaction(async () => {
      const { orderItems, totalAmount } = await buildOrderItemsAndDeductStock(items, session);
      const orderId = await generateOrderId();

      const docs = await Order.create(
        [
          {
            orderId,
            customer: customer._id,
            items: orderItems,
            totalAmount,
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
      summary: `Walk-in order ${createdOrder.orderId} created for ${customer.name} by ${req.user.name}`,
    });

    notifyOrderCreated(createdOrder, customer.phone).catch(() => {});

    res.status(201).json({ order: createdOrder });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// GET /api/orders/my (logged-in customer) — their own order history
async function getMyOrders(req, res, next) {
  try {
    const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

// GET /api/orders (admin/staff) — all orders, optionally filtered by status/source
async function getAllOrders(req, res, next) {
  try {
    const { status, source, page = 1, limit = 20 } = req.query;
    const filter = {};
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

// PUT /api/orders/:id/status (admin/staff)
async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ["pending", "confirmed", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { returnDocument: "after" }).populate(
      "customer",
      "name email phone"
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

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
  }
}

module.exports = {
  createOrder,
  createWalkInOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
};

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Inventory = require("../models/Inventory");

// POST /api/orders (logged-in customer)
// Body: { items: [{ inventoryItem, quantity }], shippingAddress, contactPhone, notes }
// Prices are always taken from the current DB record, never trusted from the client.
async function createOrder(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { items, shippingAddress, contactPhone, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let orderItems = [];
    let totalAmount = 0;

    await session.withTransaction(async () => {
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

      await Order.create(
        [
          {
            customer: req.user._id,
            items: orderItems,
            totalAmount,
            shippingAddress,
            contactPhone,
            notes,
          },
        ],
        { session }
      );
    });

    const created = await Order.findOne({ customer: req.user._id }).sort({ createdAt: -1 });
    res.status(201).json({ order: created });
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

// GET /api/orders (admin) — all orders, optionally filtered by status
async function getAllOrders(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("customer", "name email phone")
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

// PUT /api/orders/:id/status (admin)
async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ["pending", "confirmed", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate(
      "customer",
      "name email phone"
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, getMyOrders, getAllOrders, updateOrderStatus };

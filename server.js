require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const cron = require("node-cron");
const { runLowStockCheck } = require("./jobs/lowStockCheck");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const orderRoutes = require("./routes/orderRoutes");
const customerRoutes = require("./routes/customerRoutes");
const eyeTestRoutes = require("./routes/eyeTestRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const stockMovementRoutes = require("./routes/stockMovementRoutes");
const couponRoutes = require("./routes/couponRoutes");

const app = express();

// app.use(cors({
//    origin: 'https://polite-hill-0a1070300.7.azurestaticapps.net'
// }));
app.use(cors({
   origin: '*'
}));

app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "devbhoomi-opticals-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/eye-tests", eyeTestRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/stock-movements", stockMovementRoutes);
app.use("/api/coupons", couponRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Devbhoomi Opticals API running on port ${PORT}`));
});

// Runs every day at 9:00 AM server time. Adjust the cron expression if
// your server's timezone differs from IST, or if a different time suits
// the store's opening hours better.
cron.schedule("0 9 * * *", () => {
  runLowStockCheck().catch((err) => console.error("[LowStockCheck] Failed:", err));
});

module.exports = app;
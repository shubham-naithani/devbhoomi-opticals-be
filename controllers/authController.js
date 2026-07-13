const User = require("../models/User");
const { signToken } = require("../utils/token");

// POST /api/auth/register
// Public registration always creates a "customer". Admin accounts are created
// only by an existing admin via POST /api/users (see userController).
async function register(req, res, next) {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const user = await User.create({ name, email, password, phone, role: "customer" });
    const token = signToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    if (err.name === "MongoServerSelectionError" || err.name === "MongooseServerSelectionError") {
      return res.status(503).json({ message: "Database unavailable. Please check your MongoDB Atlas connection." });
    }
    next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const token = signToken(user);
    res.json({ user, token });
  } catch (err) {
    if (err.name === "MongoServerSelectionError" || err.name === "MongooseServerSelectionError") {
      return res.status(503).json({ message: "Database unavailable. Please check your MongoDB Atlas connection." });
    }
    next(err);
  }
}

// GET /api/auth/me
async function getMe(req, res) {
  res.json({ user: req.user });
}

module.exports = { register, login, getMe };

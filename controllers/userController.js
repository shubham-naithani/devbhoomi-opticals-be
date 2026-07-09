const User = require("../models/User");

// GET /api/users  (admin only) — list all users, with basic search + pagination
async function getUsers(req, res, next) {
  try {
    const { search = "", role, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (role) filter.role = role;

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/:id (admin only)
async function getUserById(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// POST /api/users (admin only) — create a user, optionally an admin/staff account
async function createUser(req, res, next) {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: role === "admin" ? "admin" : "customer",
    });

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/:id (admin only)
async function updateUser(req, res, next) {
  try {
    const { name, email, phone, role, isActive, password } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) user.password = password; // will be re-hashed by the pre-save hook

    await user.save();
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/users/:id (admin only)
async function deleteUser(req, res, next) {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };

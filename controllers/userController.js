const User = require("../models/User");
const { logAudit } = require("../utils/auditLogger");

const VALID_ROLES = ["admin", "staff", "customer"];

// GET /api/users  (admin only) — list all users, with basic search + pagination
async function getUsers(req, res, next) {
  try {
    const { search = "", role, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
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

// POST /api/users (admin only) — create an admin/staff/customer account
// Email is required here (this is the "proper" account creation form, distinct
// from the lightweight walk-in customer quick-create in customerController).
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
      role: VALID_ROLES.includes(role) ? role : "customer",
      source: "online",
    });

    await logAudit({
      entityType: "User",
      entityId: user._id,
      action: "create",
      user: req.user,
      summary: `Created ${user.role} account for ${user.name}`,
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
    if (role !== undefined && VALID_ROLES.includes(role)) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) {
      user.password = password; // will be re-hashed by the pre-save hook
      user.canLogin = true;
    }

    await user.save();

    await logAudit({
      entityType: "User",
      entityId: user._id,
      action: "update",
      user: req.user,
      summary: `Updated account for ${user.name}`,
    });

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

    await logAudit({
      entityType: "User",
      entityId: user._id,
      action: "delete",
      user: req.user,
      summary: `Deleted account for ${user.name}`,
    });

    res.json({ message: "User deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me
async function getMe(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me — self-service profile edit (name/phone only —
// email changes are a bigger decision, not exposed here yet)
async function updateMe(req, res, next) {
  try {
    const { name, phone } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me/password
async function changeMyPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const matches = await user.comparePassword(currentPassword);
    if (!matches) return res.status(400).json({ message: "Current password is incorrect" });

    user.password = newPassword; // re-hashed by the pre-save hook
    await user.save();

    res.json({ message: "Password updated" });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/addresses
async function listMyAddresses(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    res.json({ addresses: user.addresses || [] });
  } catch (err) {
    next(err);
  }
}

// POST /api/users/me/addresses
async function addMyAddress(req, res, next) {
  try {
    const { label, line1, line2, city, state, pincode, phone, isDefault } = req.body;
    if (!line1 || !city || !pincode) {
      return res.status(400).json({ message: "line1, city and pincode are required" });
    }

    const user = await User.findById(req.user._id);
    const makeDefault = isDefault || user.addresses.length === 0;
    if (makeDefault) user.addresses.forEach((a) => { a.isDefault = false; });

    user.addresses.push({ label, line1, line2, city, state, pincode, phone, isDefault: makeDefault });
    await user.save();

    res.status(201).json({ addresses: user.addresses });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me/addresses/:addressId
async function updateMyAddress(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return res.status(404).json({ message: "Address not found" });

    const { label, line1, line2, city, state, pincode, phone, isDefault } = req.body;
    if (label !== undefined) addr.label = label;
    if (line1 !== undefined) addr.line1 = line1;
    if (line2 !== undefined) addr.line2 = line2;
    if (city !== undefined) addr.city = city;
    if (state !== undefined) addr.state = state;
    if (pincode !== undefined) addr.pincode = pincode;
    if (phone !== undefined) addr.phone = phone;

    if (isDefault) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      addr.isDefault = true;
    }

    await user.save();
    res.json({ addresses: user.addresses });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/users/me/addresses/:addressId
async function deleteMyAddress(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return res.status(404).json({ message: "Address not found" });

    const wasDefault = addr.isDefault;
    addr.deleteOne();
    if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;

    await user.save();
    res.json({ addresses: user.addresses });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser,
  getMe, 
  updateMe, 
  changeMyPassword,
  listMyAddresses, 
  addMyAddress, 
  updateMyAddress, 
  deleteMyAddress,
};


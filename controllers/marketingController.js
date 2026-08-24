const crypto = require("crypto");
const XLSX = require("xlsx"); // npm install xlsx --save
const Lead = require("../models/Lead");
const Coupon = require("../models/Coupon");
const Order = require("../models/Order");
const User = require("../models/User");
const { notifyCouponIssued } = require("../services/whatsappService");

function generateCampaignCode(baseCode) {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. "A1B2C3"
  return `${baseCode}-${suffix}`;
}

// --- New Customers (leads) ------------------------------------------------

async function uploadLeads(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: "An Excel file is required" });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const uploadBatchId = new Date().toISOString();
    const results = { created: [], skipped: [] };

    for (const row of rows) {
      const firstName = String(row["First Name"] ?? row["firstName"] ?? "").trim();
      const lastName = String(row["Last Name"] ?? row["lastName"] ?? "").trim();
      const phoneRaw = String(row["Mobile"] ?? row["Phone"] ?? row["mobile"] ?? row["phone"] ?? "").trim();
      const email = String(row["Email"] ?? row["email"] ?? "").trim();
      const phone = phoneRaw.replace(/\D/g, ""); // digits only, matches how phone is likely stored elsewhere — confirm against Order's format

      if (!phone || phone.length < 10) {
        results.skipped.push({ row, reason: "Missing or invalid phone number" });
        continue;
      }

      const existingLead = await Lead.findOne({ phone });
      if (existingLead) {
        results.skipped.push({ row, reason: "Already uploaded as a lead" });
        continue;
      }

      // Order.customer is a ref to User (every order, walk-in or online, requires one), so the
      // dedupe check is against User by phone, not against Order directly.
      // TODO: confirm the field name is "phone" on your User schema (and whether there's a
      // role value — e.g. role !== "customer" — that should be excluded here so a staff/admin
      // phone number isn't mistaken for an existing customer).
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        results.skipped.push({ row, reason: "Already an existing customer — use the Existing Customers tab" });
        continue;
      }

      const lead = await Lead.create({
        firstName,
        lastName,
        phone,
        email,
        uploadBatchId,
        createdBy: req.user._id,
      });
      results.created.push(lead);
    }

    res.status(201).json(results);
  } catch (err) {
    next(err);
  }
}

async function listLeads(req, res, next) {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [leads, total] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Lead.countDocuments(filter),
    ]);
    res.json({ leads, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// --- Existing Customers (derived from Orders, no new collection) ----------

// Order.customer is a ref to User, so this groups Orders by that ref and joins into
// User for the display fields. No new Customer collection needed — matches the earlier
// decision to derive this tab from Orders rather than introduce one.
// TODO: "name" / "phone" / "email" below are a best guess at the field names on User —
// adjust the $project stage once User.js is shared. Also confirm the actual Mongo
// collection name for User in the $lookup "from" (Mongoose defaults to a lowercased,
// pluralized version of the model name — "users" — unless your schema overrides it).
async function listExistingCustomers(req, res, next) {
  try {
    const { search, page = 1, limit = 50 } = req.query;

    const pipeline = [
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: "$customer",
          orderCount: { $sum: 1 },
          lastOrderAt: { $max: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          name: "$user.name",
          phone: "$user.phone",
          email: "$user.email",
          pointsBalance: { $ifNull: ["$user.pointsBalance", 0] },
          orderCount: 1,
          lastOrderAt: 1,
        },
      },
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push(
      {
        // Default tiers — New: 1 order, Regular: 2-4, Frequent: 5+. Easy to move to a config value later.
        $addFields: {
          tier: {
            $switch: {
              branches: [
                { case: { $gte: ["$orderCount", 5] }, then: "frequent" },
                { case: { $gte: ["$orderCount", 2] }, then: "regular" },
              ],
              default: "new",
            },
          },
        },
      },
      {
        // $facet keeps a total count alongside the paged slice, for PaginationComponent.
        $facet: {
          data: [{ $sort: { orderCount: -1 } }, { $skip: (Number(page) - 1) * Number(limit) }, { $limit: Number(limit) }],
          totalCount: [{ $count: "count" }],
        },
      }
    );

    const [result] = await Order.aggregate(pipeline);
    const customers = result?.data || [];
    const total = result?.totalCount?.[0]?.count || 0;

    res.json({ customers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (err) {
    next(err);
  }
}

// --- Referral coupons ------------------------------------------------------

// Admin generates this on behalf of an existing customer (the referrer) — it's
// not self-serve. The generated code is what the referrer hands to a friend
// outside the system; there's no "recipient" to track the way a campaign send
// has, since the friend isn't in our data until they place an order with it.
// Tagging isCampaignIssued: true (alongside isReferral: true) is what makes this
// automatically excluded from the normal Coupons list and picked up by the
// existing Marketing Logs query — no new list/log endpoint needed, same as the
// project's "one rules path" approach for validateAndApplyCoupon.
async function generateReferralCoupon(req, res, next) {
  try {
    const {
      referrerUserId,
      discountType,
      value,
      minOrderValue,
      expiresAt,
      referralPercent,
      usageLimit,
      code: customCode,
    } = req.body;

    if (!referrerUserId) {
      return res.status(400).json({ message: "referrerUserId is required" });
    }
    if (!["fixed", "percentage"].includes(discountType)) {
      return res.status(400).json({ message: "discountType must be 'fixed' or 'percentage'" });
    }
    if (!(Number(value) > 0)) {
      return res.status(400).json({ message: "value must be greater than 0" });
    }
    const percent = Number(referralPercent);
    if (!(percent > 0) || percent > 100) {
      return res.status(400).json({ message: "referralPercent must be between 1 and 100" });
    }

    const referrer = await User.findById(referrerUserId);
    if (!referrer) {
      return res.status(404).json({ message: "Referrer not found" });
    }

    let code;
    if (customCode) {
      code = String(customCode).trim().toUpperCase();
      if (await Coupon.exists({ code })) {
        return res.status(400).json({ message: `Code "${code}" is already in use — choose another` });
      }
    } else {
      let attempts = 0;
      do {
        code = generateCampaignCode("REF");
        attempts += 1;
      } while ((await Coupon.exists({ code })) && attempts < 5);
    }

    const issued = await Coupon.create({
      code,
      discountType,
      value: Number(value),
      minOrderValue: Number(minOrderValue) || 0,
      expiresAt: expiresAt || undefined,
      usageLimit: usageLimit ? Number(usageLimit) : 1, // default: one friend redemption per generated code
      isActive: true,
      createdBy: req.user._id,
      isCampaignIssued: true,
      recipientType: "referral",
      recipientName: referrer.name,
      recipientPhone: referrer.phone,
      recipientEmail: referrer.email,
      sentAt: new Date(),
      whatsappStatus: "queued",
      isReferral: true,
      referrerUser: referrer._id,
      referralPercent: percent,
    });

    // Let the referrer know their code via the same "coupon issued" template —
    // the message itself just says "here's your code and discount", which
    // reads fine whether they're keeping it or handing it to a friend. Swap
    // in a dedicated referral-worded template later if you want copy that
    // explicitly mentions the points-back angle.
    const wasSent = await notifyCouponIssued(referrer.phone, referrer.name, issued);
    issued.whatsappStatus = wasSent ? "sent" : "failed";
    await issued.save();

    res.status(201).json({ coupon: issued, whatsappSent: wasSent });
  } catch (err) {
    next(err);
  }
}

// --- Sending -----------------------------------------------------------

async function sendCoupon(req, res, next) {
  try {
    const { templateCouponId, recipients } = req.body;
    // recipients: [{ type: 'lead' | 'customer', name, phone, email }]

    if (!templateCouponId || !Array.isArray(recipients) || !recipients.length) {
      return res.status(400).json({ message: "templateCouponId and at least one recipient are required" });
    }

    const template = await Coupon.findById(templateCouponId);
    if (!template || !template.isActive) {
      return res.status(400).json({ message: "Selected coupon is not available" });
    }

    const results = { sent: [], failed: [] };

    for (const recipient of recipients) {
      if (!recipient.phone) {
        results.failed.push({ recipient, reason: "No phone number" });
        continue;
      }

      let code;
      let attempts = 0;
      do {
        code = generateCampaignCode(template.code);
        attempts += 1;
      } while ((await Coupon.exists({ code })) && attempts < 5);

      const issued = await Coupon.create({
        code,
        discountType: template.discountType,
        value: template.value,
        minOrderValue: template.minOrderValue,
        expiresAt: template.expiresAt,
        usageLimit: 1, // one code per recipient, one use
        isActive: true,
        createdBy: req.user._id,
        isCampaignIssued: true,
        campaignSourceCoupon: template._id,
        recipientType: recipient.type,
        recipientName: recipient.name,
        recipientPhone: recipient.phone,
        recipientEmail: recipient.email,
        sentAt: new Date(),
        whatsappStatus: "queued",
      });

      // notifyCouponIssued never throws (same fire-and-forget contract as the other notify*
      // functions) — it returns true/false instead, which is exactly what we need to record here.
      const wasSent = await notifyCouponIssued(recipient.phone, recipient.name, issued);
      issued.whatsappStatus = wasSent ? "sent" : "failed";
      await issued.save();
      (wasSent ? results.sent : results.failed).push(wasSent ? issued : { recipient, reason: "WhatsApp send failed — see server logs" });
    }

    res.status(201).json(results);
  } catch (err) {
    next(err);
  }
}

// --- Logs ----------------------------------------------------------------

async function getMarketingLogs(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      Coupon.find({ isCampaignIssued: true })
        .populate("campaignSourceCoupon", "code")
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Coupon.countDocuments({ isCampaignIssued: true }),
    ]);

    // usageLimit is always 1 on these, so usageCount > 0 already means "this exact recipient
    // redeemed it" — no need to separately search Orders for the redeeming order.
    const rows = logs.map((c) => ({
      code: c.code,
      templateCode: c.campaignSourceCoupon?.code,
      recipientType: c.recipientType,
      recipientName: c.recipientName,
      recipientPhone: c.recipientPhone,
      recipientEmail: c.recipientEmail,
      sentAt: c.sentAt,
      whatsappStatus: c.whatsappStatus,
      redeemed: c.usageCount > 0,
    }));

    res.json({ logs: rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadLeads,
  listLeads,
  listExistingCustomers,
  generateReferralCoupon,
  sendCoupon,
  getMarketingLogs,
};

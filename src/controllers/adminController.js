// Backend/src/controllers/adminController.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Settings } from "../models/Settings.js";

import {
  approveDepositOnUser,
  applyWithdrawStatus,
} from "./walletController.js";
import bcrypt from "bcryptjs";
import { Admin } from "../models/Admin.js";
// 🔹 NEW: GET /api/admin/banks  — saare users ke addedBanks flatten karke
export async function adminListUserBanks(req, res) {
  try {
    // Sirf woh users jinke paas kam az kam 1 bank hai
    const users = await User.find({ "addedBanks.0": { $exists: true } })
      .select("username userId addedBanks createdAt")
      .lean();

    const accounts = [];

    users.forEach((u) => {
      (u.addedBanks || []).forEach((b) => {
        accounts.push({
          id: b._id,
          username: u.username,
          userId: u.userId,
          bankName: b.bankName,
          accountTitle: b.accountTitle,
          accountNumber: b.accountNumber,
          createdAt: b.createdAt || u.createdAt,
        });
      });
    });

    // Latest wali pehle
    accounts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ accounts });
  } catch (err) {
    console.error("Admin list banks error:", err);
    res.status(500).json({ message: "Failed to load user banks" });
  }
}
function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// POST /api/admin/login
export async function adminLogin(req, res) {
  try {
    const { username, password } = req.body; // username = email

    const admin = await Admin.findOne({ email: username });

    if (!admin) {
      return res.status(400).json({ message: "Invalid admin email" });
    }

    const passOk = await bcrypt.compare(password, admin.password);
    if (!passOk) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: admin._id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      name: admin.name,
      email: admin.email,
    });
  } catch (err) {
    console.log("Admin login error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/admin/users
export async function adminListUsers(req, res) {
  try {
    const dbUsers = await User.find({}).sort({ createdAt: -1 }).lean();

    const users = dbUsers.map((u) => ({
      id: u._id.toString(),
      username: u.username,
      phone: u.phone,
      userId: u.userId,
      netBalance: u.netBalance || 0,
      totalAddFund: u.totalAddFund || 0,
      totalDepositsCount: u.totalDepositsCount || 0,
      referralEarnings: u.referralEarnings || 0,
      level: u.level || 1,
      referral: u.referral || "",
      referredBy: u.referredBy || null,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));

    res.json({ users });
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
}
// 🔹 GET /api/admin/referrals
export async function adminGetReferralStats(req, res) {
  try {
    // Settings se per-referral bonus lo (fallback = 100)
    const s = await Settings.findOne().lean();
    const perReferralBonus =
      (s && typeof s.referralBonus === "number" ? s.referralBonus : 100) || 100;

    const users = await User.find().lean();

    let totalReferrals = 0;
    let totalBonusPaid = 0;

    const referrers = [];

    users.forEach((u) => {
      // referrals array ka size hi count hai
      const referralCount = Array.isArray(u.referrals) ? u.referrals.length : 0;

      // Agar DB me referralEarnings stored hai to usko use karo,
      // warna rule se calculate = count * perReferralBonus
      const storedBonus =
        typeof u.referralEarnings === "number" ? u.referralEarnings : 0;
      const calculatedBonus = referralCount * perReferralBonus;

      const totalUserBonus = storedBonus > 0 ? storedBonus : calculatedBonus;

      totalReferrals += referralCount;
      totalBonusPaid += totalUserBonus;

      if (referralCount > 0) {
        // last referral ka time (agar chahiye)
        let lastReferralDate = null;
        if (Array.isArray(u.referrals) && u.referrals.length > 0) {
          const lastRef = u.referrals[u.referrals.length - 1];
          lastReferralDate = lastRef.joinedAt || lastRef.createdAt || null;
        }

        referrers.push({
          id: u._id.toString(),
          userName: u.username,
          name: u.username,
          userId: u.userId || "G1P-XXXXXX", // public ID
          referralCode: u.referral || "N/A", // own code
          totalReferrals: referralCount,
          totalBonus: totalUserBonus,
          // UI helper fields (Admin panel friendly)
          refs: referralCount,
          bonus: totalUserBonus,
          lastReferral: lastReferralDate
            ? new Date(lastReferralDate).toLocaleString("en-GB")
            : "-",
        });
      }
    });

    // Top referrers – highest referrals first
    referrers.sort((a, b) => b.totalReferrals - a.totalReferrals);

    const referralStats = {
      totalReferrals,
      totalBonusPaid,
      activeReferrers: referrers.length,
      perReferralBonus, // so admin UI pe dikh sake: "100 PKR per referral" etc.
    };

    return res.json({ referralStats, referrers });
  } catch (err) {
    console.error("Admin referrals stats error:", err);
    res.status(500).json({ message: "Failed to load referral stats" });
  }
}

// 🔹 NEW: GET /api/admin/transactions
export async function adminListTransactions(req, res) {
  try {
    const users = await User.find().lean();
    const list = [];

    users.forEach((u) => {
      // DEPOSITS
      (u.deposits || []).forEach((d) => {
        list.push({
          id: d._id.toString(), // unique row id
          entityId: d._id.toString(), // depositId
          userId: u._id.toString(), // user document id
          user: u.username,
          type: "DEPOSIT",
          method: d.method || "",
          amount: d.totalAmount || d.amount || 0,
          status: (d.status || "Pending").toUpperCase(), // UI ke liye
          createdAt: d.date,
          proofImage: d.screenshotName
            ? `/uploads/deposits/${d.screenshotName}`
            : null,
        });
      });

      // WITHDRAWS
      (u.withdrawals || []).forEach((w) => {
        list.push({
          id: w._id.toString(),
          entityId: w._id.toString(),
          userId: u._id.toString(),
          user: u.username,
          type: "WITHDRAW",
          method: w.method || w.account || "",

          // ✅ BANK DETAILS SNAPSHOT (LOCKED AT WITHDRAW TIME)
          bankName: w.bankSnapshot?.bankName || "",
          accountTitle: w.bankSnapshot?.accountTitle || "",
          accountNumber: w.bankSnapshot?.accountNumber || "",

          amount: w.amount || 0,
          status: (w.status || "Pending").toUpperCase(),
          createdAt: w.date,
          proofImage: null,
        });
      });
    });

    // latest first
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ transactions: list });
  } catch (err) {
    console.error("Admin list transactions error:", err);
    res.status(500).json({ message: "Failed to load transactions" });
  }
}

// 🔹 GET /api/admin/overview
export async function adminGetOverview(req, res) {
  try {
    // ---------- TIME HELPERS ----------
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // ---------- BASIC USER STATS ----------
    const totalUsers = await User.countDocuments();

    const activeToday = await User.countDocuments({
      lastLoginAt: { $gte: startOfToday },
    });

    // Sum of all user netBalance
    const totalBalanceAgg = await User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$netBalance" },
        },
      },
    ]);
    const totalBalance =
      totalBalanceAgg.length > 0 ? totalBalanceAgg[0].total : 0;

    // ---------- WITHDRAW STATS ----------
    // All Pending withdrawals (any date)
    const withdrawPendingAgg = await User.aggregate([
      { $unwind: "$withdrawals" },
      { $match: { "withdrawals.status": "Pending" } },
      { $count: "count" },
    ]);
    const withdrawPending =
      withdrawPendingAgg.length > 0 ? withdrawPendingAgg[0].count : 0;

    // Withdraw Completed Today (status Approved + date >= today)
    const withdrawCompletedTodayAgg = await User.aggregate([
      { $unwind: "$withdrawals" },
      {
        $match: {
          "withdrawals.status": "Approved",
          "withdrawals.date": { $gte: startOfToday },
        },
      },
      { $count: "count" },
    ]);
    const withdrawCompletedToday =
      withdrawCompletedTodayAgg.length > 0
        ? withdrawCompletedTodayAgg[0].count
        : 0;

    // ---------- ADD FUND TODAY STATS ----------
    // Deposits created today (any status)
    const addFundTodayAgg = await User.aggregate([
      { $unwind: "$deposits" },
      {
        $match: {
          "deposits.date": { $gte: startOfToday },
        },
      },
      { $count: "count" },
    ]);
    const addFundToday =
      addFundTodayAgg.length > 0 ? addFundTodayAgg[0].count : 0;

    // ---------- RECENT DEPOSITS ----------
    const recentDepositsAgg = await User.aggregate([
      { $unwind: "$deposits" },
      {
        $project: {
          username: "$username",
          userId: "$userId",
          deposit: "$deposits",
        },
      },
      { $sort: { "deposit.date": -1 } },
      { $limit: 10 },
    ]);

    const recentDeposits = recentDepositsAgg.map((d) => {
      const dep = d.deposit || {};
      const amount =
        dep.totalAmount != null ? dep.totalAmount : dep.amount || 0;

      // Map status from DB → UI text
      let statusLabel = "Pending";
      if (dep.status === "Approved") statusLabel = "Completed";
      else if (dep.status === "Rejected") statusLabel = "Rejected";

      return {
        id: dep._id?.toString(),
        user: d.username || "Unknown",
        name: d.username || "Unknown", // AdminOverviewPage supports row.name || row.user
        userId: d.userId || "G1P-XXXXXX",
        amount,
        method: dep.method || "",
        status: statusLabel,
        time: formatDate(dep.date),
        createdAt: formatDate(dep.date),
      };
    });

    // ---------- RECENT WITHDRAWS ----------
    const recentWithdrawsAgg = await User.aggregate([
      { $unwind: "$withdrawals" },
      {
        $project: {
          username: "$username",
          userId: "$userId",
          withdrawal: "$withdrawals",
        },
      },
      { $sort: { "withdrawal.date": -1 } },
      { $limit: 10 },
    ]);

    const recentWithdraws = recentWithdrawsAgg.map((w) => {
      const wd = w.withdrawal || {};
      const amount = wd.amount || 0;

      let statusLabel = "Pending";
      if (wd.status === "Approved") statusLabel = "Completed";
      else if (wd.status === "Rejected" || wd.status === "Failed")
        statusLabel = wd.status;

      return {
        id: wd._id?.toString(),
        user: w.username || "Unknown",
        name: w.username || "Unknown",
        userId: w.userId || "G1P-XXXXXX",
        amount,
        method: wd.method || wd.account || "",
        status: statusLabel,
        time: formatDate(wd.date),
        createdAt: formatDate(wd.date),
      };
    });

    // ---------- TOP REFERRALS ----------
    // Count referrals from embedded `referrals` array
    const topReferralsAgg = await User.aggregate([
      {
        $addFields: {
          referralsCount: {
            $size: { $ifNull: ["$referrals", []] },
          },
        },
      },
      { $match: { referralsCount: { $gt: 0 } } },
      { $sort: { referralsCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          username: 1,
          userId: 1,
          referralsCount: 1,
          referralEarnings: 1,
        },
      },
    ]);

    const topReferrals = topReferralsAgg.map((u) => ({
      id: u._id.toString(),
      userName: u.username || "Unknown",
      name: u.username || "Unknown",
      userId: u.userId || "G1P-XXXXXX",
      totalReferrals: u.referralsCount || 0,
      refs: u.referralsCount || 0, // component also checks r.refs
      totalBonus: u.referralEarnings || 0,
      bonus: u.referralEarnings || 0,
    }));

    // ---------- PACK FINAL RESPONSE ----------
    const stats = {
      totalUsers,
      activeToday,
      totalBalance,
      withdrawPending,
      withdrawCompletedToday,
      addFundToday,
    };

    return res.json({
      stats,
      recentDeposits,
      recentWithdraws,
      topReferrals,
    });
  } catch (err) {
    console.error("Admin overview error:", err);
    return res.status(500).json({
      message: "Failed to load admin overview",
    });
  }
}
// GET /api/admin/deposits?status=Pending
export async function adminListDeposits(req, res) {
  const status = req.query.status || "Pending";

  const users = await User.find({ "deposits.status": status }).lean();

  const list = [];
  users.forEach((u) => {
    (u.deposits || []).forEach((d) => {
      if (status && d.status !== status) return;
      list.push({
        userId: u._id,
        username: u.username,
        phone: u.phone,
        depositId: d._id,
        amount: d.amount,
        bonusAmount: d.bonusAmount,
        totalAmount: d.totalAmount,
        method: d.method,
        status: d.status,
        date: d.date,
        // 👇 new fields for screenshot
        screenshotName: d.screenshotName || null,
        screenshotUrl: d.screenshotName
          ? `/uploads/deposits/${d.screenshotName}`
          : null,
      });
    });
  });

  res.json(list);
}

// PATCH /api/admin/deposits/:userId/:depositId
export async function adminUpdateDepositStatus(req, res) {
  try {
    const { userId, depositId } = req.params;
    const { status } = req.body; // Pending / Approved / Rejected

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const dep = user.deposits.id(depositId);
    if (!dep) return res.status(404).json({ message: "Deposit not found" });

    if (status === "Approved") {
      await approveDepositOnUser(user, depositId);
    } else {
      dep.status = status;
      await user.save();
    }

    res.json({ message: "Deposit updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update deposit" });
  }
}

// GET /api/admin/withdraws?status=Pending
export async function adminListWithdraws(req, res) {
  const status = req.query.status || "Pending";

  const users = await User.find({ "withdrawals.status": status }).lean();
  const list = [];

  users.forEach((u) => {
    (u.withdrawals || []).forEach((w) => {
      if (status && w.status !== status) return;
      list.push({
        userId: u._id,
        username: u.username,
        phone: u.phone,
        withdrawId: w._id,
        amount: w.amount,
        // 🟢 ab hum "account" string use kar rahe hain (schema ke mutabiq)
        account: w.account,
        status: w.status,
        date: w.date,
      });
    });
  });

  res.json(list);
}

// PATCH /api/admin/withdraws/:userId/:withdrawId
export async function adminUpdateWithdrawStatus(req, res) {
  try {
    const { userId, withdrawId } = req.params;
    const { status } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await applyWithdrawStatus(user, withdrawId, status);
    res.json({ message: "Withdraw updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update withdraw" });
  }
}

// GET /api/admin/overview
export async function adminOverview(req, res) {
  try {
    const totalUsers = await User.countDocuments();

    const users = await User.find().lean();

    let totalDeposits = 0;
    let totalWithdraws = 0;
    let pendingDeposits = 0;
    let pendingWithdraws = 0;

    const recentTransactions = [];

    users.forEach((u) => {
      (u.deposits || []).forEach((d) => {
        totalDeposits += d.totalAmount || 0;
        if (d.status === "Pending") pendingDeposits++;
        recentTransactions.push({
          id: d._id,
          user: u.username,
          type: "DEPOSIT",
          method: d.method,
          amount: d.totalAmount,
          status: d.status,
          createdAt: d.date,
        });
      });

      (u.withdrawals || []).forEach((w) => {
        totalWithdraws += w.amount || 0;
        if (w.status === "Pending") pendingWithdraws++;
        recentTransactions.push({
          id: w._id,
          user: u.username,
          type: "WITHDRAW",
          method: w.account,
          amount: w.amount,
          status: w.status,
          createdAt: w.date,
        });
      });
    });

    recentTransactions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.json({
      stats: {
        totalUsers,
        activeToday: 0,
        totalDeposits,
        totalWithdraws,
        pendingDeposits,
        pendingWithdraws,
      },
      recentTransactions: recentTransactions.slice(0, 10),
    });
  } catch (err) {
    console.log("Dashboard error:", err);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
}

export async function adminUpdateUserStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!["ACTIVE", "BLOCKED"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.status = status;
  await user.save();

  res.json({ message: "Status updated", user });
}

export async function adminUpdateDepositAccount(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Missing deposit account id" });
    }

    const payload = req.body || {};

    const acc = await AdminDepositAccount.findByIdAndUpdate(
      id,
      {
        $set: {
          method: payload.method,
          label: payload.label,
          accountTitle: payload.accountTitle,
          accountNumber: payload.accountNumber,
          instructions: payload.instructions,
          isActive: payload.isActive,
        },
      },
      { new: true }
    );

    if (!acc) {
      return res.status(404).json({ message: "Deposit account not found" });
    }

    return res.json({ message: "Updated successfully", account: acc });
  } catch (err) {
    console.error("adminUpdateDepositAccount error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
}

export async function adminDeleteDepositAccount(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Missing deposit account id" });
    }

    const deleted = await AdminDepositAccount.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Deposit account not found" });
    }

    return res.json({ success: true, message: "Account deleted" });
  } catch (err) {
    console.error("adminDeleteDepositAccount error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
}

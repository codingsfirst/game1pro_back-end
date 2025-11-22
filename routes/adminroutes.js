// Backend/routes/adminroutes.js
const express = require("express");
const User = require("../models/User");
const Transaction = require("../models/Transaction"); // isko bhi banao agar abhi nahi banaya
const router = express.Router();

// TODO: yahan baad me admin auth middleware add kar sakte ho
// const adminAuth = require("../middleware/adminAuth");

/**
 * GET /api/admin/users?query=...
 * Admin user search by phone / username / referralCode
 */
router.get("/users", async (req, res) => {
  try {
    const { query } = req.query;
    const filter = {};

    if (query) {
      filter.$or = [
        { phone: { $regex: query, $options: "i" } },
        { username: { $regex: query, $options: "i" } },
        { referralCode: { $regex: query, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select(
        "username phone referralCode balance withdrawableBalance status createdAt"
      )
      .limit(50)
      .sort({ createdAt: -1 });

    res.json({ success: true, users });
  } catch (err) {
    console.error("Admin user search error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST /api/admin/users/:userId/adjust-balance
 * body: { amount, direction, reason }
 * direction: "CREDIT" | "DEBIT"
 */
router.post("/users/:userId/adjust-balance", async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, direction, reason } = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount must be > 0" });
    }

    if (!["CREDIT", "DEBIT"].includes(direction)) {
      return res.status(400).json({
        success: false,
        message: "Direction must be CREDIT or DEBIT",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // balance update
    if (direction === "CREDIT") {
      user.balance += amount;
      user.withdrawableBalance += amount;
    } else {
      // DEBIT
      if (user.withdrawableBalance < amount) {
        return res.status(400).json({
          success: false,
          message: "User does not have enough withdrawable balance",
        });
      }
      user.balance -= amount;
      user.withdrawableBalance -= amount;
    }

    await user.save();

    // transaction create (agar Transaction model bana hua hai)
    let tx = null;
    try {
      tx = await Transaction.create({
        user: user._id,
        type: "ADMIN_ADJUST",
        direction,
        amount,
        method: "ADMIN_PANEL",
        status: "APPROVED",
        source: "ADMIN_ADJUST",
        adminReason: reason || "Admin manual adjustment",
        reviewedAt: new Date(),
      });
    } catch (e) {
      console.error("Transaction create failed:", e.message);
    }

    res.json({
      success: true,
      message: "Balance adjusted successfully",
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance,
        withdrawableBalance: user.withdrawableBalance,
      },
      transaction: tx,
    });
  } catch (err) {
    console.error("Admin adjust balance error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/users/:userId/transactions
 * User transaction history for admin
 */
router.get("/users/:userId/transactions", async (req, res) => {
  try {
    const { userId } = req.params;

    const txs = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ success: true, transactions: txs });
  } catch (err) {
    console.error("Admin user transactions error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;

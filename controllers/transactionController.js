const Transaction = require("../models/Transaction");
const User = require("../models/User");

// helper: calculate deposit bonus
function calculateBonus(amount) {
  const a = Number(amount);
  if ([100, 250, 500].includes(a)) return (a * 3) / 100;
  if (a === 1000) return (a * 5) / 100;
  if ([3000, 10000].includes(a)) return (a * 7) / 100;
  return 0;
}

// POST /api/transactions/deposit
// user creates deposit request (PENDING)
exports.createDeposit = async (req, res, next) => {
  try {
    const { amount, method, proofUrl } = req.body;

    if (!amount || !method) {
      return res
        .status(400)
        .json({ message: "Amount and method are required" });
    }

    const tx = await Transaction.create({
      user: req.user._id,
      type: "DEPOSIT",
      amount,
      method,
      proofUrl: proofUrl || null,
      status: "PENDING",
    });

    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
};

// POST /api/transactions/withdraw
exports.createWithdraw = async (req, res, next) => {
  try {
    const { amount, method, bankAccountId } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (amount > user.withdrawableBalance) {
      return res
        .status(400)
        .json({ message: "Amount exceeds withdrawable balance" });
    }

    const tx = await Transaction.create({
      user: req.user._id,
      type: "WITHDRAW",
      amount,
      method,
      bankAccount: bankAccountId || null,
      status: "PENDING",
    });

    // option: yahan immediate balance lock mat karo,
    // approve ke waqt hi deduct kar sakte ho.
    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
};

// GET /api/transactions/my
exports.getMyTransactions = async (req, res, next) => {
  try {
    const tx = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("bankAccount");
    res.json(tx);
  } catch (err) {
    next(err);
  }
};

/* ===== Admin side actions (approve / reject) ===== */

// PATCH /api/transactions/:id/approve
exports.approveTransaction = async (req, res, next) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    if (tx.status !== "PENDING") {
      return res
        .status(400)
        .json({ message: "Only pending transactions can be approved" });
    }

    const user = await User.findById(tx.user);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (tx.type === "DEPOSIT") {
      const bonus = calculateBonus(tx.amount);
      user.balance += tx.amount + bonus;
      user.withdrawableBalance += tx.amount + bonus; // agar full withdrawable
    } else if (tx.type === "WITHDRAW") {
      if (tx.amount > user.withdrawableBalance) {
        return res
          .status(400)
          .json({ message: "User withdrawable balance insufficient" });
      }
      user.balance -= tx.amount;
      user.withdrawableBalance -= tx.amount;
    }

    tx.status = "APPROVED";

    await user.save();
    await tx.save();

    res.json({ message: "Transaction approved", tx });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/transactions/:id/reject
exports.rejectTransaction = async (req, res, next) => {
  try {
    const { adminNote } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    if (tx.status !== "PENDING") {
      return res
        .status(400)
        .json({ message: "Only pending transactions can be rejected" });
    }

    tx.status = "REJECTED";
    tx.adminNote = adminNote || "Rejected by admin";
    await tx.save();

    res.json({ message: "Transaction rejected", tx });
  } catch (err) {
    next(err);
  }
};

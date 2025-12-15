// Backend/src/controllers/walletController.js
import { calculateLevel } from "../utils/level.js";
import { AdminDepositAccount } from "../models/AdminDepositAccount.js";
import User from "../models/User.js";
// normalize same as before (or export from a shared file)
function normalizeMethod(method) {
  if (!method) return null;
  const m = method.toString().trim().toLowerCase();
  if (m.includes("jazz")) return "jazzcash";
  if (m.includes("easy")) return "easypaisa";
  if (m.includes("sada")) return "sadapay";
  if (m.includes("naya")) return "nayapay";
  if (m.includes("binance")) return "binance";
  if (m.includes("bank")) return "bank";
  return null;
}

// 🔹 GET /api/wallet/deposit-accounts?method=jazzcash
export async function getDepositAccounts(req, res) {
  try {
    const { method } = req.query;

    const query = { isActive: true };
    if (method) {
      // match by normalized method
      const all = await AdminDepositAccount.find({ isActive: true }).lean();
      const filtered = all.filter(
        (a) => normalizeMethod(a.method) === method.toLowerCase()
      );

      const accounts = filtered.map((a) => ({
        id: a._id.toString(),
        method: normalizeMethod(a.method),
        accountNumber: a.accountNumber,
        holderName: a.accountTitle,
        instructions: a.instructions || "",
        createdAt: a.createdAt,
      }));

      return res.json({ accounts });
    }

    // if no method filter, return all
    const all = await AdminDepositAccount.find({ isActive: true }).lean();
    const accounts = all.map((a) => ({
      id: a._id.toString(),
      method: normalizeMethod(a.method),
      accountNumber: a.accountNumber,
      holderName: a.accountTitle,
      instructions: a.instructions || "",
      createdAt: a.createdAt,
    }));

    res.json({ accounts });
  } catch (err) {
    console.error("getDepositAccounts error:", err);
    res.status(500).json({ message: "Failed to load deposit accounts" });
  }
}
// GET /api/wallet/addfund-history
export async function getAddFundHistory(req, res) {
  const user = req.user;

  const history = [...(user.deposits || [])]
    .sort((a, b) => b.date - a.date)
    .map((d) => ({
      id: d._id,
      type: "Add Fund",
      amount: d.totalAmount || d.amount,
      account: d.method,
      date: d.date,
      status: d.status,
      screenshotName: d.screenshotName || null,
      screenshotUrl: d.screenshotName
        ? `/uploads/deposits/${d.screenshotName}`
        : null,
    }));

  res.json({ history });
}

// GET /api/wallet/withdraw-history
export async function getWithdrawHistory(req, res) {
  const user = req.user;

  const history = [...(user.withdrawals || [])]
    .sort((a, b) => b.date - a.date)
    .map((w) => ({
      id: w._id,
      type: "Withdraw",
      amount: w.amount,
      account: w.account, // simple string from schema
      date: w.date,
      status: w.status,
    }));

  res.json({ history });
}

// POST /api/wallet/deposits
export async function createDeposit(req, res) {
  try {
    const user = req.user;
    const { method, amount, senderAccount, senderName } = req.body;

    const numericAmount = Number(amount || 0);
    if (!method || !numericAmount || !senderAccount || !senderName) {
      return res.status(400).json({
        message: "method, amount, senderAccount & senderName required",
      });
    }

    // screenshot file name (agar file upload hua ho)
    const screenshotName =
      (req.file && req.file.filename) || req.body.screenshotName || null;

    // bonus rules
    let bonus = 0;
    if ([100, 250, 500].includes(numericAmount)) bonus = numericAmount * 0.03;
    else if (numericAmount === 1000) bonus = numericAmount * 0.05;
    else if ([3000, 10000].includes(numericAmount))
      bonus = numericAmount * 0.07;

    const totalAmount = numericAmount + bonus;

    user.deposits.push({
      amount: numericAmount,
      bonusAmount: bonus,
      totalAmount,
      method,
      screenshotName,
      status: "Pending",
    });

    await user.save();

    res.json({ message: "Deposit request created", success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create deposit" });
  }
}

// Helper: admin deposit approve kare
export async function approveDepositOnUser(user, depositId) {
  const deposit = user.deposits.id(depositId);
  if (!deposit) return;

  if (deposit.status === "Approved") return;

  deposit.status = "Approved";
  user.totalAddFund += deposit.totalAmount;
  user.totalDepositsCount += 1;
  user.netBalance += deposit.totalAmount;

  if (typeof user.recalculateLevel === "function") {
    user.recalculateLevel();
  } else {
    user.level = calculateLevel(user.totalAddFund || 0);
  }

  user.notifications.push({
    title: "Deposit approved",
    message: `Your deposit of ${deposit.totalAmount} PKR has been approved.`,
    read: false,
  });

  await user.save();
}

// 🔁 Helper: admin withdraw status change karega
export async function applyWithdrawStatus(user, withdrawId, newStatus) {
  const w = user.withdrawals.id(withdrawId);
  if (!w) return;

  if (w.status === newStatus) return;

  // sirf Pending se hi change allow karein (safety)
  if (w.status !== "Pending") return;

  // NOTE:
  // createWithdraw pe hi netBalance se amount cut ho chuka hoga.
  // Approved → kuch nahi karna.
  // Rejected → amount wapas netBalance me add.
  if (newStatus === "Rejected") {
    const current = Number(user.netBalance || 0);
    user.netBalance = current + Number(w.amount || 0);

    user.notifications.push({
      title: "Withdraw rejected",
      message: `Your withdraw of ${w.amount} PKR was rejected. Amount has been returned to your wallet.`,
      read: false,
    });
  } else if (newStatus === "Approved") {
    user.notifications.push({
      title: "Withdraw approved",
      message: `Your withdraw of ${w.amount} PKR has been approved.`,
      read: false,
    });
  }

  w.status = newStatus;
  await user.save();
}

// POST /api/wallet/withdraw
export async function createWithdraw(req, res) {
  try {
    const user = req.user;

    // ✅ accept bankId from frontend
    const {
      amount,
      method,
      bankId, // ✅ coming from frontend
      accountTitle,
      accountNumber,
      bankName, // optional
    } = req.body;

    const numericAmount = Number(amount || 0);
    if (!numericAmount || !method) {
      return res
        .status(400)
        .json({ message: "amount & method required for withdraw" });
    }

    if (numericAmount < 500) {
      return res.status(400).json({ message: "Minimum withdraw is 500 PKR" });
    }

    const currentBalance = Number(user.netBalance || 0);
    if (numericAmount > currentBalance) {
      return res
        .status(400)
        .json({ message: "Insufficient balance for withdraw" });
    }

    // ✅ find selected saved bank from user.addedBanks (secure)
    let selectedBank = null;
    if (bankId) {
      selectedBank = user.addedBanks?.id(bankId) || null;
    }

    // ✅ build snapshot from saved bank first (best + safe)
    const snapshot = selectedBank
      ? {
          bankName: selectedBank.bankName,
          accountTitle: selectedBank.accountTitle,
          accountNumber: selectedBank.accountNumber,
        }
      : {
          // fallback: if bankId missing, use provided fields (less safe but works)
          bankName: bankName || method,
          accountTitle: accountTitle || "",
          accountNumber: accountNumber || "",
        };

    // ✅ Cut balance immediately
    user.netBalance = currentBalance - numericAmount;
    if (user.netBalance < 0) user.netBalance = 0;

    // ✅ account string (for legacy screens)
    const accountLabel = `${snapshot.bankName || method} - ${
      snapshot.accountTitle || ""
    } (${snapshot.accountNumber || ""})`.trim();

    user.withdrawals.push({
      amount: numericAmount,
      method, // keep method too
      account: accountLabel, // legacy
      bankSnapshot: snapshot, // ✅ IMPORTANT
      status: "Pending",
    });

    user.notifications.push({
      title: "Withdraw requested",
      message: `Your withdraw of ${numericAmount} PKR is pending review.`,
      read: false,
    });

    await user.save();

    // ✅ return updated user for frontend
    res.json({ message: "Withdraw request created", success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create withdraw" });
  }
}

// ✅ POST /api/wallet/game-netbalance
export async function updateNetBalanceFromGame(req, res) {
  try {
    const userId = req.user._id;

    const { amount, gameId, reason = "SETTLE", roundId, meta = {} } = req.body;

    if (!gameId || !roundId) {
      return res
        .status(400)
        .json({ message: "gameId and roundId are required" });
    }

    const delta = Number(amount);
    if (!Number.isFinite(delta)) {
      return res.status(400).json({ message: "amount must be a number" });
    }

    // ✅ Prevent double update for same round
    const already = await User.findOne({
      _id: userId,
      "gameLedger.roundId": roundId,
      "gameLedger.gameId": gameId,
      "gameLedger.reason": reason,
    }).select("netBalance");

    if (already) {
      return res.json({
        ok: true,
        netBalance: already.netBalance,
        duplicate: true,
      });
    }

    // ✅ Atomic update (inc + ledger push)
    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { netBalance: delta },
        $push: {
          gameLedger: {
            roundId,
            gameId,
            reason,
            amount: delta,
            meta,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    ).select("netBalance");

    return res.json({ ok: true, netBalance: updated.netBalance });
  } catch (err) {
    console.error("updateNetBalanceFromGame error:", err);
    return res.status(500).json({ message: "Failed to update net balance" });
  }
}

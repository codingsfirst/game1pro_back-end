// backend/src/controllers/adminSettingsController.js
import { Settings } from "../models/Settings.js";
import { AdminDepositAccount } from "../models/AdminDepositAccount.js";

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function normalizeBuckets(buckets = []) {
  const next = (Array.isArray(buckets) ? buckets : [])
    .map((b) => ({
      pTo: Number(b.pTo),
      min: Number(b.min),
      max: Number(b.max),
    }))
    .filter(
      (b) =>
        Number.isFinite(b.pTo) &&
        Number.isFinite(b.min) &&
        Number.isFinite(b.max)
    )
    .sort((a, b) => a.pTo - b.pTo);

  for (let i = 0; i < next.length; i++) {
    const prevP = i === 0 ? 0 : next[i - 1].pTo;
    next[i].pTo = clamp(next[i].pTo, prevP + 0.0001, 1.0);
    next[i].min = clamp(next[i].min, 0, 9999);
    next[i].max = clamp(next[i].max, 0, 9999);
    if (next[i].max < next[i].min) {
      const t = next[i].min;
      next[i].min = next[i].max;
      next[i].max = t;
    }
  }

  if (next.length) next[next.length - 1].pTo = 1.0;
  return next;
}

// ✅ Load system settings
export async function getSettings(req, res) {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  res.json(s);
}

// ✅ Update system settings (FIXED)
export async function updateSettings(req, res) {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});

  // basic fields
  const fields = [
    "bonus100to500",
    "bonus1000",
    "bonus3000to10000",
    "withdrawNote",
    "referralBonus",
  ];

  fields.forEach((f) => {
    if (req.body[f] !== undefined) s[f] = req.body[f];
  });

  // ✅ Aviator crash config (nested)
  if (req.body.aviatorCrash !== undefined) {
    const ac = req.body.aviatorCrash || {};
    if (!s.aviatorCrash) s.aviatorCrash = {};

    if (ac.enabled !== undefined) s.aviatorCrash.enabled = !!ac.enabled;

    if (ac.maxMultiplier !== undefined) {
      const m = Number(ac.maxMultiplier);
      if (Number.isFinite(m)) s.aviatorCrash.maxMultiplier = clamp(m, 2, 9999);
    }

    if (ac.buckets !== undefined) {
      const buckets = normalizeBuckets(ac.buckets);
      if (buckets.length >= 2) s.aviatorCrash.buckets = buckets;
    }
  }

  await s.save();
  res.json(s);
}

// ✅ Deposit Accounts
export async function adminGetDepositAccounts(req, res) {
  const accounts = await AdminDepositAccount.find().sort({ createdAt: -1 });
  res.json({ accounts });
}

export async function adminCreateDepositAccount(req, res) {
  const acc = await AdminDepositAccount.create(req.body);
  res.json({ account: acc });
}

export async function adminUpdateDepositAccount(req, res) {
  try {
    const { id } = req.params;

    const acc = await AdminDepositAccount.findById(id);
    if (!acc) return res.status(404).json({ message: "Deposit account not found" });

    const fields = [
      "method",
      "label",
      "accountTitle",
      "accountNumber",
      "instructions",
      "isActive",
    ];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) acc[f] = req.body[f];
    });

    await acc.save();
    res.json({ account: acc });
  } catch (err) {
    console.error("adminUpdateDepositAccount error:", err);
    res.status(500).json({ message: "Failed to update deposit account" });
  }
}

export async function adminDeleteDepositAccount(req, res) {
  try {
    const { id } = req.params;

    const acc = await AdminDepositAccount.findById(id);
    if (!acc) return res.status(404).json({ message: "Deposit account not found" });

    await acc.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error("adminDeleteDepositAccount error:", err);
    res.status(500).json({ message: "Failed to delete deposit account" });
  }
}

import { Settings } from "../models/Settings.js";
import { AdminDepositAccount } from "../models/AdminDepositAccount.js";

// Load system settings
export async function getSettings(req, res) {
  let s = await Settings.findOne();
  if (!s) {
    s = await Settings.create({});
  }
  res.json(s);
}

// Update system settings

export async function updateSettings(req, res) {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});

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

  await s.save();
  res.json(s);
}

// Get all admin deposit accounts
export async function adminGetDepositAccounts(req, res) {
  const accounts = await AdminDepositAccount.find().sort({ createdAt: -1 });
  res.json({ accounts });
}

// Create deposit account
export async function adminCreateDepositAccount(req, res) {
  const acc = await AdminDepositAccount.create(req.body);
  res.json({ account: acc });
}
// Update deposit account
export async function adminUpdateDepositAccount(req, res) {
  try {
    const { id } = req.params;

    const acc = await AdminDepositAccount.findById(id);
    if (!acc) {
      return res.status(404).json({ message: "Deposit account not found" });
    }

    const fields = [
      "method",
      "label",
      "accountTitle",
      "accountNumber",
      "instructions",
      "isActive",
    ];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        acc[f] = req.body[f];
      }
    });

    await acc.save();

    res.json({ account: acc });
  } catch (err) {
    console.error("adminUpdateDepositAccount error:", err);
    res.status(500).json({ message: "Failed to update deposit account" });
  }
}

// Delete deposit account
export async function adminDeleteDepositAccount(req, res) {
  try {
    const { id } = req.params;

    const acc = await AdminDepositAccount.findById(id);
    if (!acc) {
      return res.status(404).json({ message: "Deposit account not found" });
    }

    await acc.deleteOne();

    res.json({ success: true });
  } catch (err) {
    console.error("adminDeleteDepositAccount error:", err);
    res.status(500).json({ message: "Failed to delete deposit account" });
  }
}
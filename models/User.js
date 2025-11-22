const mongoose = require("mongoose");

// ── Saved bank / wallet accounts (max 3, route pe control hoga)
const bankAccountSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },        // e.g. "JazzCash", "Easypaisa", "Meezan Bank"
    holderName: { type: String, required: true },   // account holder name
    accountNumber: { type: String, required: true },// 0300-xxxxxxx / IBAN / Wallet id
    isDefault: { type: Boolean, default: false },   // optional: default withdraw account
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    // ── BASIC AUTH
    username: { type: String, required: true },
    phone: { type: String, required: true, unique: true }, // login by phone
    passwordHash: { type: String, required: true },

    // optional but useful for phone formatting
    countryCode: { type: String, default: "+92" }, // Frontend pe tum phone-input use kar rahe ho

    // role: user / admin
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // ── WALLET
    balance: { type: Number, default: 0 },           // total wallet
    withdrawableBalance: { type: Number, default: 0 }, // jo withdraw ho sakta hai

    // ── GAME / PROFILE
    level: { type: Number, default: 1 },
    avatarUrl: { type: String, default: null },      // profile picture path/url
    status: { type: String, enum: ["active", "blocked"], default: "active" },

    // ── REFERRAL SYSTEM
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    referralEarnings: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 },

    // ── BANK / WALLET ACCOUNTS (profile page pe jo CRUD bana hai us ke liye)
    bankAccounts: [bankAccountSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

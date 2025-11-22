// backend/src/models/Transaction.js
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    // kis user ki transaction hai
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // transaction kis type ki hai
    type: {
      type: String,
      enum: ["ADD_FUND", "WITHDRAW", "ADMIN_ADJUST"],
      required: true,
    },

    // paisa andar ja raha hai ya bahar?
    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT"], // CREDIT = add, DEBIT = minus
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    // deposit bonuses ke liye (agar ho)
    bonusPercent: {
      type: Number,
      default: 0,
    },
    bonusAmount: {
      type: Number,
      default: 0,
    },

    // konsi method se transaction hui
    method: {
      type: String,
      enum: [
        "JazzCash",
        "Easypaisa",
        "Sadapay",
        "NayaPay",
        "Binance",
        "Bank",
        "ADMIN_PANEL", // admin ne manual ki
      ],
      required: true,
    },

    // deposit / withdraw account details
    toAccountLabel: { type: String }, // "JazzCash Official 0300-xxxxxxx"
    toAccountNumber: { type: String },

    // user deposit proof
    payerAccountNumber: { type: String },
    payerName: { type: String },
    proofImageUrl: { type: String }, // screenshot URL / path

    // sab transaction ka status
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    // **extra info – kaha se aya**
    source: {
      type: String,
      enum: ["USER_DEPOSIT", "ADMIN_ADJUST", "REFERRAL_BONUS", "GAME_RESULT"],
      default: "USER_DEPOSIT",
    },

    // admin manual adjustment info
    adminReason: { type: String },
    adminBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);

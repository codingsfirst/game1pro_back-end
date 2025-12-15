// Backend/src/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const { Schema } = mongoose;

function generateUserId() {
  // Example: G1P-AB12CD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `G1P-${random}`;
}

// ------------------------
// Sub-schemas
// ------------------------
const bankSchema = new Schema(
  {
    bankName: { type: String, required: true },
    accountTitle: { type: String, required: true },
    accountNumber: { type: String, required: true },
  },
  {
    _id: true,
    timestamps: true, // 👈 yahan add karo (createdAt, updatedAt)
  }
);

const depositSchema = new Schema(
  {
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    bonusAmount: { type: Number, default: 0 }, // extra bonus amount
    totalAmount: { type: Number, required: true }, // amount + bonus
    method: { type: String },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    screenshotName: { type: String },
  },
  { _id: true }
);

const withdrawSchema = new Schema(
  {
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    account: { type: String }, // bank name / wallet (legacy)
    method: { type: String }, // new usage
    bankSnapshot: {
      bankName: String,
      accountTitle: String,
      accountNumber: String,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Failed"],
      default: "Pending",
    },
  },
  { _id: true }
);

const referralSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    username: String,
    avatarUrl: String,
    userId: String,
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const notificationSchema = new Schema(
  {
    title: String,
    message: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ------------------------
// Main User schema
// ------------------------
const userSchema = new Schema(
  {
    // 1. Username
    username: { type: String, required: true },

    // 2. Contact Number
    phone: { type: String, required: true, unique: true },

    // 3. Referral code (self) – PUBLIC CODE
    referral: { type: String, unique: true },

    // 4. Referred By (optional → parent referral code)
    referredBy: { type: String, default: null },

    // 5. Password (hashed)
    password: { type: String, required: true },

    // 6. Role NOT needed (skip)

    // 7. NetBalance (main wallet)
    netBalance: { type: Number, default: 0 },
    // ✅ Game ledger (for preventing duplicate settle)
    gameLedger: [
      {
        roundId: { type: String, required: true },
        gameId: { type: String, required: true },
        reason: { type: String, default: "SETTLE" }, // BET/WIN/LOSS/SETTLE
        amount: { type: Number, required: true }, // +win / -loss
        meta: { type: Schema.Types.Mixed, default: {} },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // 💰 7b. Total referral earnings (stats ke liye)
    referralEarnings: { type: Number, default: 0 },

    // 8. totalAddFund
    totalAddFund: { type: Number, default: 0 },

    // 9. level
    level: { type: Number, default: 1 },

    // 10. Total deposits (Countable)
    totalDepositsCount: { type: Number, default: 0 },

    // extra: status
    status: { type: String, default: "active" },

    // 11 + 12 createdAt / updatedAt → timestamps option se

    // 13. AddedBanks
    addedBanks: [bankSchema],

    // 14. Deposit array
    deposits: [depositSchema],

    // 15. Withdraw array
    withdrawals: [withdrawSchema],

    // 16. Referrals
    referrals: [referralSchema],

    // 17. Profile picture
    avatarUrl: { type: String, default: null },

    // 18. Last login
    lastLoginAt: { type: Date, default: null },

    // 19. userId (public id shown in frontend)
    userId: {
      type: String,
      unique: true,
      default: () => generateUserId(),
    },
    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED"],
      default: "ACTIVE",
    },
    // 20. Notifications
    notifications: [notificationSchema],
  },
  { timestamps: true }
);

// ------------------------
// Hooks / methods
// ------------------------
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;

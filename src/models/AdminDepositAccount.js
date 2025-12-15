import mongoose from "mongoose";

const adminDepositAccountSchema = new mongoose.Schema(
  {
    method: { type: String, required: true },
    label: { type: String },
    accountTitle: { type: String, required: true },
    accountNumber: { type: String, required: true },
    instructions: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const AdminDepositAccount = mongoose.model(
  "AdminDepositAccount",
  adminDepositAccountSchema
);

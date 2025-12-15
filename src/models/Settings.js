// backend/src/models/Settings.js
import mongoose from "mongoose";

const aviatorBucketSchema = new mongoose.Schema(
  {
    pTo: { type: Number, required: true }, // 0..1 (cumulative)
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    bonus100to500: { type: Number, default: 3 },
    bonus1000: { type: Number, default: 5 },
    bonus3000to10000: { type: Number, default: 7 },

    withdrawNote: {
      type: String,
      default: "Withdraw requests are processed within 2 hours (max).",
    },

    referralBonus: { type: Number, default: 100 },

    // ✅ Aviator crash config
    aviatorCrash: {
      enabled: { type: Boolean, default: true },
      maxMultiplier: { type: Number, default: 40 },

      buckets: {
        type: [aviatorBucketSchema],
        default: [
          { pTo: 0.3, min: 0.0, max: 1.0 },
          { pTo: 0.6, min: 1.0, max: 3.0 },
          { pTo: 0.8, min: 3.0, max: 7.0 },
          { pTo: 0.9, min: 7.0, max: 20.0 },
          { pTo: 1.0, min: 20.0, max: 40.0 },
        ],
      },
    },
  },
  { timestamps: true }
);

export const Settings = mongoose.model("Settings", settingsSchema);

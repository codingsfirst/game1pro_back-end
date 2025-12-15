import mongoose from "mongoose";

const { Schema } = mongoose;

const resolvedSchema = new Schema(
  {
    betId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    stake: { type: Number, required: true },
    cashedAt: { type: Number, default: null },

    cashed: { type: Boolean, default: false },

    payout: { type: Number, default: 0 },  // stake + profit
    profit: { type: Number, default: 0 },  // profit only
  },
  { _id: false }
);

const roundSchema = new Schema(
  {
    roundId: { type: String, required: true, unique: true },
    timestamp: { type: String, required: true }, // ISO string
    crashAt: { type: Number, required: true },

    totalBets: { type: Number, default: 0 },
    totalStake: { type: Number, default: 0 },

    resolved: { type: [resolvedSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Round", roundSchema);

// backend/src/engine/worker_zoo.js
import mongoose from "mongoose";
import { Worker } from "bullmq";

// ✅ engine -> src/models
import ZooRound from "../models/ZooRound.js";
import User from "../models/User.js";

const REDIS_URL =
  process.env.REDIS_URL || process.env.REDIS || "redis://127.0.0.1:6379";
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/yourdb";

async function init() {
  await mongoose.connect(MONGO_URI, {});
  console.log("Zoo Worker connected to MongoDB");

  const worker = new Worker(
    "zoo-round-persist",
    async (job) => {
      const r = job.data;

      const doc = new ZooRound({
        roundId: r.roundId,
        timestamp: r.timestamp,
        winner: r.winner,
        totalBets: r.totalBets,
        totalStake: r.totalStake,
        roundPayout: r.roundPayout,
        resolved: (r.resolved || []).map((x) => ({
          betId: x.betId,
          userId: x.userId,
          boxId: x.boxId,
          group: x.group,
          stake: x.stake,
          mult: x.mult,
          isWin: x.isWin,
          payout: x.payout,
        })),
      });

      await doc.save();

      // Optional: append user gameHistory (keep last 50)
      for (const rr of r.resolved || []) {
        try {
          const user = await User.findById(rr.userId);
          if (!user) continue;

          const entry = {
            date: new Date(),
            bet: "zoo-roulette",
            betAmount: rr.stake,
            dice: [],
            result: rr.isWin ? "Win" : "Loss",
            amount: rr.isWin ? rr.payout : -rr.stake,
          };

          user.gameHistory = user.gameHistory || [];
          user.gameHistory.unshift(entry);
          if (user.gameHistory.length > 50) user.gameHistory.pop();
          await user.save();
        } catch (err) {
          console.warn("Zoo Worker: failed to update user history", err);
        }
      }

      return { ok: true };
    },
    { connection: { url: REDIS_URL } }
  );

  worker.on("completed", (job) =>
    console.log("Zoo Worker: job completed", job.id)
  );
  worker.on("failed", (job, err) =>
    console.error("Zoo Worker: job failed", job?.id, err)
  );
}

init().catch((e) => {
  console.error("Zoo Worker init error:", e);
  process.exit(1);
});

// backend/src/engine/worker_aviator.js
import mongoose from "mongoose";
import { Worker } from "bullmq";
import Round from "../models/Round.js";
import User from "../models/User.js";

const REDIS_URL =
  process.env.REDIS_URL || process.env.REDIS || "redis://127.0.0.1:6379";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/yourdb";

async function init() {
  await mongoose.connect(MONGO_URI, {});
  console.log("✅ Aviator Worker connected to MongoDB");

  const worker = new Worker(
    "round-persist",
    async (job) => {
      const r = job.data;

      // Persist round
      const roundDoc = new Round({
        roundId: r.roundId,
        timestamp: r.timestamp,
        crashAt: r.crashAt,
        totalBets: r.totalBets,
        totalStake: r.totalStake,
        resolved: (r.resolved || []).map((res) => {
          const payout = Number(res.payout || 0);
          const stake = Number(res.stake || 0);
          const profit =
            res.profit !== undefined
              ? Number(res.profit || 0)
              : Number((payout - stake).toFixed(2));

          return {
            betId: res.betId,
            userId: res.userId,
            stake,
            cashedAt: res.cashedAt,
            cashed: !!res.cashed,
            payout,
            profit,
          };
        }),
      });

      await roundDoc.save();

      // Update user gameHistory (keep last 50)
      for (const rr of r.resolved || []) {
        try {
          const user = await User.findById(rr.userId);
          if (!user) continue;

          const stake = Number(rr.stake || 0);
          const payout = Number(rr.payout || 0);
          const profit =
            rr.profit !== undefined
              ? Number(rr.profit || 0)
              : Number((payout - stake).toFixed(2));

          // Net change on balance:
          // - Loss: -stake (stake already deducted at bet placement, but history should show loss)
          // - Win: +profit (because payout includes stake already deducted)
          const netAmount = rr.cashed ? profit : -stake;

          const entry = {
            date: new Date(),
            bet: "aviator",
            betAmount: stake,
            dice: [],
            result: rr.cashed ? "Win" : "Loss",
            amount: netAmount,
            meta: {
              roundId: r.roundId,
              betId: rr.betId,
              crashAt: r.crashAt,
              cashedAt: rr.cashedAt || null,
              payout: rr.cashed ? payout : 0,
              profit: rr.cashed ? profit : 0,
            },
          };

          user.gameHistory = user.gameHistory || [];
          user.gameHistory.unshift(entry);
          if (user.gameHistory.length > 50) user.gameHistory.pop();

          await user.save();
        } catch (err) {
          console.warn("Aviator Worker: failed to update user history", err);
        }
      }

      return { ok: true };
    },
    { connection: { url: REDIS_URL } }
  );

  worker.on("completed", (job) =>
    console.log("✅ Aviator Worker: job completed", job.id)
  );
  worker.on("failed", (job, err) =>
    console.error("❌ Aviator Worker: job failed", job?.id, err)
  );
}

init().catch((e) => {
  console.error("❌ Aviator Worker init error:", e);
  process.exit(1);
});

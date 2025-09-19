// backend/gameEngine.js  (update only the cashOut emit payload to include profit, and keep balance math correct)
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import Round from "./models/Round.js";
import { Queue } from "bullmq";

const REDIS_URL =
  process.env.REDIS_URL || process.env.REDIS || "redis://127.0.0.1:6379";

export const PHASES = {
  WAITING: "WAITING",
  BETTING: "BETTING",
  RUNNING: "RUNNING",
  ENDED: "ENDED",
};

const BET_WINDOW_MS = 15 * 1000;
const RUN_INTERVAL_MS = 100;
const POST_ROUND_PAUSE_MS = 5 * 1000;
const MIN_BET = 5;
const MAX_BET = 50000;
const MAX_MULTIPLIER = 40.0;

const roundQueue = new Queue("round-persist", {
  connection: { url: REDIS_URL },
});

function generateCrash() {
  const p = Math.random() * 100;
  let min, max;

  if (p < 60) {
    // 60% chance → 0x – 1x
    min = 0.0;
    max = 1.0;
  } else if (p < 80) {
    // 20% chance → 1x – 3x
    min = 1.0;
    max = 3.0;
  } else if (p < 90) {
    // 10% chance → 3x – 7x
    min = 3.0;
    max = 7.0;
  } else if (p < 95) {
    // 5% chance → 10x – 20x
    min = 10.0;
    max = 20.0;
  } else {
    // last 5% → 20x – 40x
    min = 20.0;
    max = 40.0;
  }

  const val = Math.random() * (max - min) + min;
  return Math.min(Number(val.toFixed(2)), MAX_MULTIPLIER);
}

async function verifyToken(token) {
  try {
    if (!token) return null;
    const t = token.replace(/^Bearer\s+/i, "");
    const payload = jwt.verify(t, process.env.JWT_SECRET);
    if (!payload?.id) return null;
    const user = await User.findById(payload.id);
    return user || null;
  } catch {
    return null;
  }
}

export default function initGameEngine(io) {
  let phase = PHASES.WAITING;
  let roundStartAt = null;
  let runStartAt = null;
  let crashPoint = null;
  let multiplier = 0.0;
  let runInterval = null;

  let bets = [];
  let publicBets = [];
  const historyCache = [];
  let currentRoundId = null;

  function broadcastPhase() {
    io.emit("gamePhase", {
      phase,
      serverTime: Date.now(),
      roundStartAt,
      runStartAt,
      multiplier: phase === PHASES.RUNNING ? multiplier : 0.0,
      betWindowRemaining:
        phase === PHASES.BETTING
          ? Math.max(0, BET_WINDOW_MS - (Date.now() - roundStartAt))
          : 0,
      betsCount: bets.length,
      recentHistory: historyCache.slice(0, 50),
      roundId: currentRoundId,
      currentRoundBets: publicBets,
    });
  }

  function broadcastMultiplier() {
    io.emit("multiplier", { multiplier, serverTime: Date.now() });
  }

  async function finalizeRoundAndEnqueue() {
    const resolved = bets.map((b) => {
      const cashed =
        typeof b.cashedAt === "number" && b.cashedAt < crashPoint + 1e-9;
      const payout = cashed ? Number((b.amount * b.cashedAt).toFixed(2)) : 0;
      return {
        betId: b.id,
        userId: b.userId,
        stake: b.amount,
        cashedAt: b.cashedAt || null,
        cashed,
        payout,
      };
    });

    const roundRecord = {
      roundId: currentRoundId || `R${Date.now()}`,
      timestamp: new Date().toISOString(),
      crashAt: crashPoint,
      totalBets: bets.length,
      totalStake: bets.reduce((s, b) => s + b.amount, 0),
      resolved,
    };

    historyCache.unshift(roundRecord);
    if (historyCache.length > 200) historyCache.pop();

    io.emit("roundEnd", {
      crashAt: crashPoint,
      resolved,
      roundId: roundRecord.roundId,
      timestamp: roundRecord.timestamp,
    });

    await roundQueue.add("persistRound", roundRecord, {
      removeOnComplete: true,
      attempts: 3,
    });

    bets = [];
    publicBets = [];
  }

  function startBettingPhase() {
    phase = PHASES.BETTING;
    currentRoundId = `R${Date.now()}`;
    roundStartAt = Date.now();
    runStartAt = null;
    multiplier = 0.0;
    crashPoint = null;
    if (runInterval) {
      clearInterval(runInterval);
      runInterval = null;
    }
    publicBets = [];

    broadcastPhase();

    let remainingTime = BET_WINDOW_MS;
    let secondsLeft = Math.ceil(remainingTime / 1000);

    const timerInterval = setInterval(() => {
      remainingTime = BET_WINDOW_MS - (Date.now() - roundStartAt);
      secondsLeft = Math.max(0, Math.ceil(remainingTime / 1000));
      io.emit("timerUpdate", { timeLeft: secondsLeft });
      if (remainingTime <= 0) {
        clearInterval(timerInterval);
        if (phase === PHASES.BETTING) startRunningPhase();
      }
    }, 1000);

    setTimeout(() => {
      if (phase === PHASES.BETTING) {
        clearInterval(timerInterval);
        startRunningPhase();
      }
    }, BET_WINDOW_MS);
  }

  function startRunningPhase() {
    phase = PHASES.RUNNING;
    runStartAt = Date.now();
    multiplier = 0.0;
    crashPoint = generateCrash();

    broadcastPhase();
    broadcastMultiplier();

    runInterval = setInterval(() => {
      multiplier = Number((multiplier * 1.02 + 0.01).toFixed(2));
      if (multiplier >= MAX_MULTIPLIER) multiplier = MAX_MULTIPLIER;
      broadcastMultiplier();

      if (multiplier >= crashPoint) {
        multiplier = crashPoint;
        clearInterval(runInterval);
        runInterval = null;
        phase = PHASES.ENDED;
        finalizeRoundAndEnqueue().catch(console.error);
        broadcastPhase();
        setTimeout(() => startBettingPhase(), POST_ROUND_PAUSE_MS);
      }
    }, RUN_INTERVAL_MS);
  }

  startBettingPhase();

  io.on("connection", (socket) => {
    socket.emit("connected", { socketId: socket.id });
    socket.emit("gamePhase", {
      phase,
      serverTime: Date.now(),
      roundStartAt,
      runStartAt,
      multiplier,
      betWindowRemaining:
        phase === PHASES.BETTING
          ? Math.max(0, BET_WINDOW_MS - (Date.now() - roundStartAt))
          : 0,
      betsCount: bets.length,
      recentHistory: historyCache.slice(0, 50),
      roundId: currentRoundId,
      currentRoundBets: publicBets,
    });

    socket.on("placeBet", async (payload, cb) => {
      try {
        if (phase !== PHASES.BETTING)
          return (
            cb &&
            cb({ ok: false, code: "NOT_BETTING", message: "Betting closed." })
          );

        const amount = Number(payload?.amount || 0);
        if (!amount || isNaN(amount) || amount < MIN_BET || amount > MAX_BET) {
          return (
            cb &&
            cb({
              ok: false,
              code: "INVALID_AMOUNT",
              message: `Bet must be between ${MIN_BET} and ${MAX_BET}.`,
            })
          );
        }

        const user = await verifyToken(payload?.token);
        if (!user)
          return (
            cb &&
            cb({
              ok: false,
              code: "UNAUTH",
              message: "Authentication required.",
            })
          );

        if ((user.coins || 0) < amount)
          return (
            cb &&
            cb({
              ok: false,
              code: "INSUFFICIENT",
              message: "Insufficient balance.",
            })
          );

        user.coins = user.coins - amount; // stake deducted now
        await user.save();

        const bet = {
          id: `B${Date.now()}${Math.floor(Math.random() * 9999)}`,
          userId: user._id.toString(),
          socketId: socket.id,
          amount,
          placedAt: Date.now(),
          cashedAt: null,
        };

        bets.push(bet);
        publicBets.push({ id: bet.id, amount: bet.amount, cashedAt: null });

        io.emit("publicBetPlaced", { id: bet.id, amount: bet.amount });
        io.to(socket.id).emit("betPlacedPrivate", { newBalance: user.coins });

        cb && cb({ ok: true, bet: { id: bet.id, amount: bet.amount } });
      } catch (err) {
        console.error("placeBet error", err);
        cb && cb({ ok: false, code: "ERR", message: "Server error" });
      }
    });

    socket.on("cashOut", async (payload, cb) => {
      try {
        if (phase !== PHASES.RUNNING)
          return (
            cb &&
            cb({
              ok: false,
              code: "NOT_RUNNING",
              message: "Round not running.",
            })
          );

        const betId = payload?.betId;
        if (!betId)
          return (
            cb && cb({ ok: false, code: "NO_BET_ID", message: "No bet id." })
          );

        const bet = bets.find((b) => b.id === betId);
        if (!bet)
          return (
            cb && cb({ ok: false, code: "NO_BET", message: "Bet not found." })
          );
        if (bet.cashedAt)
          return (
            cb &&
            cb({
              ok: false,
              code: "ALREADY_CASHED",
              message: "Already cashed out.",
            })
          );

        const user = await verifyToken(payload?.token);
        if (!user || user._id.toString() !== bet.userId)
          return (
            cb && cb({ ok: false, code: "UNAUTH", message: "Unauthorized." })
          );

        bet.cashedAt = multiplier;

        const payout = Number((bet.amount * bet.cashedAt).toFixed(2)); // total returned (stake+profit)
        const profit = Number((payout - bet.amount).toFixed(2)); // profit only

        user.coins = (user.coins || 0) + payout; // add full payout; net effect = +profit (stake was deducted)
        await user.save();

        io.to(bet.socketId).emit("cashed", {
          betId: bet.id,
          cashedAt: bet.cashedAt,
          payout, // total (for reference)
          stake: bet.amount,
          profit, // profit only (use this in UI)
          newBalance: user.coins,
        });

        io.emit("publicCashed", { betId: bet.id });

        cb &&
          cb({
            ok: true,
            betId: bet.id,
            cashedAt: bet.cashedAt,
            payout,
            profit,
          });
      } catch (err) {
        console.error("cashOut error", err);
        cb && cb({ ok: false, code: "ERR", message: "Server error" });
      }
    });

    socket.on("cancelBet", async (payload, cb) => {
      try {
        if (phase !== PHASES.BETTING)
          return (
            cb &&
            cb({
              ok: false,
              code: "NOT_BETTING",
              message: "Can only cancel during betting phase.",
            })
          );

        const betId = payload?.betId;
        if (!betId)
          return (
            cb && cb({ ok: false, code: "NO_BET_ID", message: "No bet id." })
          );

        const bet = bets.find((b) => b.id === betId);
        if (!bet)
          return (
            cb && cb({ ok: false, code: "NO_BET", message: "Bet not found." })
          );

        const user = await verifyToken(payload?.token);
        if (!user || user._id.toString() !== bet.userId)
          return (
            cb && cb({ ok: false, code: "UNAUTH", message: "Unauthorized." })
          );

        user.coins = (user.coins || 0) + bet.amount; // refund stake
        await user.save();

        bets = bets.filter((b) => b.id !== betId);
        publicBets = publicBets.filter((b) => b.id !== betId);

        io.to(bet.socketId).emit("betCanceled", {
          betId: bet.id,
          amount: bet.amount,
          newBalance: user.coins,
        });

        cb && cb({ ok: true, betId: bet.id, amount: bet.amount });
      } catch (err) {
        console.error("cancelBet error", err);
        cb && cb({ ok: false, code: "ERR", message: "Server error" });
      }
    });

    socket.on("disconnect", () => {});
  });
}

// backend/src/engine/aviatorEngine.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Round from "../models/Round.js";
import { Queue } from "bullmq";
import { Settings } from "../models/Settings.js";

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
const DEFAULT_MAX_MULTIPLIER = 40.0;

async function getAviatorMaxMultiplier() {
  const s = await Settings.findOne().lean();
  const m = Number(s?.aviatorCrash?.maxMultiplier ?? DEFAULT_MAX_MULTIPLIER);
  return Number.isFinite(m)
    ? Math.min(9999, Math.max(2, m))
    : DEFAULT_MAX_MULTIPLIER;
}

const getUserBalance = (u) => Number(u?.netBalance ?? u?.coins ?? 0);
const setUserBalance = (u, next) => {
  // prefer netBalance, fallback to coins for old schema
  if (u.netBalance !== undefined) u.netBalance = Number(next);
  else u.coins = Number(next);
};

async function generateCrash() {
  const s = await Settings.findOne().lean();
  const cfg = s?.aviatorCrash;

  const MAXM = Number(cfg?.maxMultiplier ?? MAX_MULTIPLIER);
  const buckets = Array.isArray(cfg?.buckets) ? cfg.buckets : null;

  // fallback: your original logic
  if (!cfg?.enabled || !buckets || buckets.length < 2) {
    const p = Math.random();
    let min, max;

    if (p < 0.3) {
      min = 0.0;
      max = 1.0;
    } else if (p < 0.6) {
      min = 1.0;
      max = 3.0;
    } else if (p < 0.8) {
      min = 3.0;
      max = 7.0;
    } else if (p < 0.9) {
      min = 7.0;
      max = 20.0;
    } else {
      min = 20.0;
      max = 40.0;
    }

    const val = Math.random() * (max - min) + min;
    return Math.min(Number(val.toFixed(2)), MAX_MULTIPLIER);
  }

  const p = Math.random();
  let chosen = buckets[buckets.length - 1];

  for (const b of buckets) {
    if (p < Number(b.pTo)) {
      chosen = b;
      break;
    }
  }

  const min = Number(chosen.min);
  const max = Number(chosen.max);
  const val = Math.random() * (max - min) + min;

  return Math.min(Number(val.toFixed(2)), MAXM);
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

export default function initAviatorEngine(io) {
  let phase = PHASES.WAITING;
  let roundStartAt = null;
  let runStartAt = null;
  let crashPoint = null;
  let multiplier = 1.0;
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
      multiplier: phase === PHASES.RUNNING ? multiplier : 1.0,
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
      const profit = cashed ? Number((payout - b.amount).toFixed(2)) : 0;

      return {
        betId: b.id,
        userId: b.userId,
        stake: b.amount,
        cashedAt: b.cashedAt || null,
        cashed,
        payout,
        profit,
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
    multiplier = 1.0;
    crashPoint = null;

    if (runInterval) {
      clearInterval(runInterval);
      runInterval = null;
    }

    publicBets = [];
    broadcastPhase();

    let remainingTime = BET_WINDOW_MS;

    const timerInterval = setInterval(() => {
      remainingTime = BET_WINDOW_MS - (Date.now() - roundStartAt);
      const secondsLeft = Math.max(0, Math.ceil(remainingTime / 1000));
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

  async function startRunningPhase() {
    phase = PHASES.RUNNING;
    runStartAt = Date.now();
    multiplier = 1.0;

    const maxM = await getAviatorMaxMultiplier();
    crashPoint = await generateCrash();

    broadcastPhase();
    broadcastMultiplier();

    runInterval = setInterval(() => {
      multiplier = Number((multiplier * 1.02 + 0.01).toFixed(2));
      if (multiplier >= maxM) multiplier = maxM;

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
          return cb?.({
            ok: false,
            code: "NOT_BETTING",
            message: "Betting closed.",
          });

        const amount = Number(payload?.amount || 0);
        if (!amount || isNaN(amount) || amount < MIN_BET || amount > MAX_BET) {
          return cb?.({
            ok: false,
            code: "INVALID_AMOUNT",
            message: `Bet must be between ${MIN_BET} and ${MAX_BET}.`,
          });
        }

        const user = await verifyToken(payload?.token);
        if (!user)
          return cb?.({
            ok: false,
            code: "UNAUTH",
            message: "Authentication required.",
          });

        const bal = getUserBalance(user);
        if (bal < amount)
          return cb?.({
            ok: false,
            code: "INSUFFICIENT",
            message: "Insufficient balance.",
          });

        // stake deducted now
        setUserBalance(user, bal - amount);
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
        io.to(socket.id).emit("betPlacedPrivate", {
          newBalance: getUserBalance(user),
        });

        cb?.({ ok: true, bet: { id: bet.id, amount: bet.amount } });
      } catch (err) {
        console.error("placeBet error", err);
        cb?.({ ok: false, code: "ERR", message: "Server error" });
      }
    });

    socket.on("cashOut", async (payload, cb) => {
      try {
        if (phase !== PHASES.RUNNING)
          return cb?.({
            ok: false,
            code: "NOT_RUNNING",
            message: "Round not running.",
          });

        const betId = payload?.betId;
        if (!betId)
          return cb?.({ ok: false, code: "NO_BET_ID", message: "No bet id." });

        const bet = bets.find((b) => b.id === betId);
        if (!bet)
          return cb?.({ ok: false, code: "NO_BET", message: "Bet not found." });
        if (bet.cashedAt)
          return cb?.({
            ok: false,
            code: "ALREADY_CASHED",
            message: "Already cashed out.",
          });

        const user = await verifyToken(payload?.token);
        if (!user || user._id.toString() !== bet.userId)
          return cb?.({ ok: false, code: "UNAUTH", message: "Unauthorized." });

        bet.cashedAt = multiplier;

        const payout = Number((bet.amount * bet.cashedAt).toFixed(2)); // stake+profit
        const profit = Number((payout - bet.amount).toFixed(2)); // profit only

        // add full payout; net effect is +profit (stake already deducted)
        const bal = getUserBalance(user);
        setUserBalance(user, bal + payout);
        await user.save();

        io.to(bet.socketId).emit("cashed", {
          betId: bet.id,
          roundId: currentRoundId,
          cashedAt: bet.cashedAt,
          payout,
          stake: bet.amount,
          profit,
          newBalance: getUserBalance(user),
        });

        io.emit("publicCashed", { betId: bet.id });

        cb?.({
          ok: true,
          betId: bet.id,
          cashedAt: bet.cashedAt,
          payout,
          profit,
        });
      } catch (err) {
        console.error("cashOut error", err);
        cb?.({ ok: false, code: "ERR", message: "Server error" });
      }
    });

    socket.on("cancelBet", async (payload, cb) => {
      try {
        if (phase !== PHASES.BETTING)
          return cb?.({
            ok: false,
            code: "NOT_BETTING",
            message: "Can only cancel during betting phase.",
          });

        const betId = payload?.betId;
        if (!betId)
          return cb?.({ ok: false, code: "NO_BET_ID", message: "No bet id." });

        const bet = bets.find((b) => b.id === betId);
        if (!bet)
          return cb?.({ ok: false, code: "NO_BET", message: "Bet not found." });

        const user = await verifyToken(payload?.token);
        if (!user || user._id.toString() !== bet.userId)
          return cb?.({ ok: false, code: "UNAUTH", message: "Unauthorized." });

        // refund stake
        const bal = getUserBalance(user);
        setUserBalance(user, bal + bet.amount);
        await user.save();

        bets = bets.filter((b) => b.id !== betId);
        publicBets = publicBets.filter((b) => b.id !== betId);

        io.to(bet.socketId).emit("betCanceled", {
          betId: bet.id,
          amount: bet.amount,
          newBalance: getUserBalance(user),
        });

        cb?.({ ok: true, betId: bet.id, amount: bet.amount });
      } catch (err) {
        console.error("cancelBet error", err);
        cb?.({ ok: false, code: "ERR", message: "Server error" });
      }
    });

    socket.on("disconnect", () => {});
  });
}

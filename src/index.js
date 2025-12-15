// backend/src/index.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import { spawn } from "child_process";

import { connectDB } from "./config/db.js";
import { seedAdmin } from "./config/adminSeeder.js";

import { Settings } from "./models/Settings.js";
import { AdminDepositAccount } from "./models/AdminDepositAccount.js";

import { EngineManager } from "./engine/EngineManager.js";
import initZooEngine from "./engine/zooEngine.js"; // ✅ FIXED
import initAviatorEngine from "./engine/aviatorEngine.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import bankRoutes from "./routes/bankRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import gameRoutes from "./routes/gameRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------ Middleware ------------------ */
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

/* ------------------ Static uploads ------------------ */
const uploadDir = process.env.UPLOAD_DIR || "uploads";
app.use("/uploads", express.static(path.join(process.cwd(), uploadDir)));

fs.mkdirSync(path.join(process.cwd(), uploadDir, "avatars"), {
  recursive: true,
});
fs.mkdirSync(path.join(process.cwd(), uploadDir, "deposits"), {
  recursive: true,
});

/* ------------------ Health ------------------ */
app.get("/", (req, res) => {
  res.json({ status: "Game1Pro backend running" });
});

/* ------------------ Settings helper ------------------ */
async function getOrCreateSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}

/* ------------------ Deposit packages ------------------ */
app.get("/deposit-packages", async (req, res) => {
  try {
    const s = await getOrCreateSettings();
    res.json([
      { id: "p100", amount: 100, bonus: s.bonus100to500 },
      { id: "p250", amount: 250, bonus: s.bonus100to500 },
      { id: "p500", amount: 500, bonus: s.bonus100to500 },
      { id: "p1000", amount: 1000, bonus: s.bonus1000 },
      { id: "p3000", amount: 3000, bonus: s.bonus3000to10000 },
      { id: "p10000", amount: 10000, bonus: s.bonus3000to10000 },
    ]);
  } catch (err) {
    console.error("GET /deposit-packages error:", err);
    res.json([
      { id: "p100", amount: 100, bonus: 3 },
      { id: "p250", amount: 250, bonus: 3 },
      { id: "p500", amount: 500, bonus: 3 },
      { id: "p1000", amount: 1000, bonus: 5 },
      { id: "p3000", amount: 3000, bonus: 7 },
      { id: "p10000", amount: 10000, bonus: 7 },
    ]);
  }
});

/* ------------------ Payment methods ------------------ */
const METHOD_META = {
  jazzcash: { label: "JazzCash", icon: "📱" },
  easypaisa: { label: "Easypaisa", icon: "⚡" },
  sadapay: { label: "Sadapay", icon: "💳" },
  nayapay: { label: "NayaPay", icon: "💸" },
  binance: { label: "Binance", icon: "₿" },
  bank: { label: "Bank Transfer", icon: "🏦" },
};

function normalizeMethod(method) {
  if (!method) return null;
  const m = method.toString().trim().toLowerCase();
  if (m.includes("jazz")) return "jazzcash";
  if (m.includes("easy")) return "easypaisa";
  if (m.includes("sada")) return "sadapay";
  if (m.includes("naya")) return "nayapay";
  if (m.includes("binance")) return "binance";
  if (m.includes("bank")) return "bank";
  return null;
}

app.get("/payment-methods", async (req, res) => {
  try {
    const accounts = await AdminDepositAccount.find({ isActive: true }).lean();
    const ids = new Set();

    for (const acc of accounts) {
      const id = normalizeMethod(acc.method);
      if (id && METHOD_META[id]) ids.add(id);
    }

    const methods = Array.from(ids).map((id) => ({
      id,
      label: METHOD_META[id].label,
      icon: METHOD_META[id].icon,
    }));

    if (!methods.length) {
      return res.json([
        { id: "jazzcash", label: "JazzCash", icon: "📱" },
        { id: "easypaisa", label: "Easypaisa", icon: "⚡" },
        { id: "sadapay", label: "Sadapay", icon: "💳" },
        { id: "nayapay", label: "NayaPay", icon: "💸" },
        { id: "binance", label: "Binance", icon: "₿" },
      ]);
    }

    res.json(methods);
  } catch (err) {
    console.error("GET /payment-methods error:", err);
    res.json([
      { id: "jazzcash", label: "JazzCash", icon: "📱" },
      { id: "easypaisa", label: "Easypaisa", icon: "⚡" },
      { id: "sadapay", label: "Sadapay", icon: "💳" },
      { id: "nayapay", label: "NayaPay", icon: "💸" },
      { id: "binance", label: "Binance", icon: "₿" },
    ]);
  }
});

/* ------------------ API routes ------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/user/banks", bankRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/admin", adminRoutes);

/* ------------------ 404 ------------------ */
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

/* ------------------ Worker auto-start ------------------ */
function startWorker(name, relPathFromSrc) {
  const fullPath = path.join(__dirname, relPathFromSrc);

  const child = spawn(process.execPath, [fullPath], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    console.log(`❌ Worker "${name}" exited with code ${code}`);
  });

  console.log(`✅ Worker "${name}" started: ${relPathFromSrc}`);
  return child;
}

/* ------------------ Boot ------------------ */
connectDB()
  .then(async () => {
    await seedAdmin();

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // ✅ connect frontend namespace: /zoo
    initZooEngine(io);

    // ✅ other engines
    const engineManager = new EngineManager(io);
    engineManager.start();
    initAviatorEngine(io);
    startWorker("aviator-worker", "./engine/worker_aviator.js");
    // ✅ auto start zoo worker (same folder: src/engine)
    startWorker("zoo-worker", "./engine/worker_zoo.js");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🧠 Zoo Engine running + Zoo Worker auto-started`);
    });
  })
  .catch((err) => {
    console.error("❌ DB connection failed", err);
    process.exit(1);
  });

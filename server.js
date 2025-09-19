// server.js
import express from "express";
import http from "http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { Server as IOServer } from "socket.io";

/* ---- Routes ---- */
import authRoutes from "./routes/authRoutes.js";
import bankRoutes from "./routes/bankRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import withdrawRoutes from "./routes/withdrawRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import agentHistoryRoutes from "./routes/agentHistoryRoutes.js";
import removeCoinRoutes from "./routes/removeCoinRoutes.js";
import adminRoutesauth from "./routes/adminRoutesauth.js";
import agentRoutes_v2 from "./routes/agentRoutes_v2.js";
import coinRoutes_v2 from "./routes/coinRoutes_v2.js";
import orderRoutes from "./routes/orderRoutes.js";
import agentRoutesV2 from "./routes/agentRoutes_v2.js";
import gameRoutes from "./routes/gameRoutes.js";
import roundRoutes from "./routes/roundRoutes.js";

/* ---- Game Engines ---- */
import initGameEngine from "./gameEngine.js"; // Aviator (your existing engine)
import initZooEngine from "./zooEngine.js"; // Animal roulette (this file below)

// Quiet dotenv
dotenv.config({ quiet: true });

const app = express();

/* ---- CORS / JSON ---- */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://game1pro.com",
    ],
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Welcome to my Node.js project 🚀");
});

/* ---- REST Routes ---- */
app.use("/api/auth", authRoutes);
app.use("/accounts", bankRoutes);
app.use("/api/users", userRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", agentRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/agents/history", agentHistoryRoutes);
app.use("/api/remove-coins", removeCoinRoutes);
app.use("/api/admins", adminRoutesauth);
app.use("/api/v2/agents-v2", agentRoutesV2);
app.use("/api/game", gameRoutes);
app.use("/api/rounds", roundRoutes);
app.use("/api/agents-v2", agentRoutes_v2);
app.use("/api/coins-v2", coinRoutes_v2);
app.use("/api/orders", orderRoutes);

app.get("/health", (req, res) => res.send("ok"));

/* ---- HTTP + Socket.IO ---- */
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://game1pro.com",
    ],
    credentials: true,
  },
});

/* ---- Initialize Game Engines (Sockets) ---- */
initGameEngine(io); // Aviator
const zooApi = initZooEngine(io); // Zoo roulette

/* ---- Optional HTTP snapshot for Zoo engine ---- */
app.get("/api/zoo/current-round", (req, res) => {
  try {
    const snap = zooApi.getSnapshot();
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

/* ---- MongoDB ---- */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

/* ---- Start with auto port fallback ---- */
const BASE_PORT = Number(process.env.PORT) || 5000;
const MAX_TRIES = 6; // 5000..5005

function listenOnPort(port, attempt = 1) {
  server.once("error", (err) => {
    if (err?.code === "EADDRINUSE" && attempt < MAX_TRIES) {
      const next = port + 1;
      listenOnPort(next, attempt + 1);
    } else {
      console.error("❌ Server error:", err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log("🚀 Server + sockets running on port ${port}");
  });
}

listenOnPort(BASE_PORT);

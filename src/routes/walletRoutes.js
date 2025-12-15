// Backend/src/routes/walletRoutes.js
import express from "express";
import { auth } from "../middleware/auth.js";
import {
  getAddFundHistory,
  getWithdrawHistory,
  createDeposit,
  createWithdraw,
} from "../controllers/walletController.js";

import multer from "multer";
import path from "path";
import { getDepositAccounts } from "../controllers/walletController.js";
import { updateNetBalanceFromGame } from "../controllers/walletController.js";

// ===== Multer for deposit screenshots =====
const depositStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), "uploads", "deposits"));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(
      null,
      `${Date.now()}-${Math.round(Math.random() * 1e9).toString()}${ext}`
    );
  },
});

const uploadDeposit = multer({ storage: depositStorage });

const router = express.Router();

// History
router.get("/addfund-history", auth, getAddFundHistory);
router.get("/withdraw-history", auth, getWithdrawHistory);
// For user deposit flow
router.post("/game-netbalance", auth, updateNetBalanceFromGame);

router.get("/deposit-accounts", getDepositAccounts);
// Deposit screenshot upload (payment proof)
router.post(
  "/upload-slip",
  auth,
  uploadDeposit.single("screenshot"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const filename = req.file.filename;
    const url = `/uploads/deposits/${filename}`;
    res.json({ filename, url });
  }
);

// Create deposit (JSON body + screenshotName string)
router.post("/deposits", auth, createDeposit);

// Withdraw
router.post("/withdraw", auth, createWithdraw);

export default router;

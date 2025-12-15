import express from "express";
import { auth } from "../middleware/auth.js";
import {
  listBanks,
  createBank,
  updateBank,
  deleteBank
} from "../controllers/bankController.js";

const router = express.Router();

router.get("/", auth, listBanks);
router.post("/", auth, createBank);
router.put("/:id", auth, updateBank);
router.delete("/:id", auth, deleteBank);

export default router;

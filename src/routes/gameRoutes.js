import express from "express";
import { auth } from "../middleware/auth.js";
import { listGames, getGameById } from "../controllers/gameController.js";

const router = express.Router();

router.get("/", auth, listGames);
router.get("/:id", auth, getGameById);

export default router;

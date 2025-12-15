import express from "express";
import { auth } from "../middleware/auth.js";
import { listNotifications } from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", auth, listNotifications);

export default router;

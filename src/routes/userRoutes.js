import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { auth } from "../middleware/auth.js";
import { updateProfile, changePassword } from "../controllers/userController.js";

const router = express.Router();

// Multer config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), "uploads", "avatars"));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage });

router.post("/profile", auth, upload.single("avatar"), updateProfile);
router.put("/password", auth, changePassword);

export default router;

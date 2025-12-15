import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// POST /api/user/profile  (multipart)
export async function updateProfile(req, res) {
  try {
    const user = req.user;
    const { displayName } = req.body;

    if (displayName) {
      user.username = displayName;
    }

    if (req.file) {
      // store path like /uploads/avatars/xyz.jpg
      const relative = `/uploads/avatars/${req.file.filename}`;
      user.avatarUrl = relative;
    }

    await user.save();

    const plain = user.toObject();
    delete plain.password;

    res.json({ user: plain });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update profile" });
  }
}

// PUT /api/user/password
export async function changePassword(req, res) {
  try {
    const user = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "currentPassword & newPassword required" });
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ message: "Current password not correct" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to change password" });
  }
}

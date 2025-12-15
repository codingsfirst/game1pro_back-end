// Backend/src/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

function signToken(user, extra = {}) {
  return jwt.sign(
    { id: user._id.toString(), ...extra },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
}

// POST /api/auth/signup
export async function signup(req, res) {
  try {
    const { username, phone, password, referralCode } = req.body;

    if (!username || !phone || !password) {
      return res
        .status(400)
        .json({ message: "username, phone & password required" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: "Phone already registered" });
    }

    // ❌ manual hash ki zaroorat nahi, pre-save hook karega
    const user = new User({
      username,
      phone,
      password, // plain rakho, hook hash karega
      referredBy: referralCode || null,
    });

    // ensure referral code (self) hamesha non-null & unique ho
    if (!user.referral) {
      user.referral =
        user.userId ||
        `G1P-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }

    // ⚡ REFERRER BONUS LOGIC
    if (referralCode) {
      const referrer = await User.findOne({ referral: referralCode });

      if (referrer) {
        // referrals list me add karna (pahle se jo logic tha)
        referrer.referrals.push({
          user: user._id,
          username: user.username,
        });

        // ✅ yahan se BONUS CREDIT
        const REF_BONUS = Number(process.env.REFERRAL_SIGNUP_BONUS || 0);
        if (REF_BONUS > 0) {
          const currentNet = Number(referrer.netBalance || 0);
          const currentRefEarnings = Number(referrer.referralEarnings || 0);

          referrer.netBalance = currentNet + REF_BONUS;
          referrer.referralEarnings = currentRefEarnings + REF_BONUS;

          referrer.notifications.push({
            title: "Referral bonus",
            message: `You earned ${REF_BONUS} PKR because ${user.username} joined using your referral code.`,
            read: false,
          });
        }

        await referrer.save();
      }
    }

    await user.save();

    const token = signToken(user);
    user.lastLoginAt = new Date();
    await user.save();

    const plainUser = user.toObject();
    delete plainUser.password;

    return res.json({ token, user: plainUser });
  } catch (err) {
    console.error(err);

    // yeh jo referral null duplicate error aaya tha uska clean message
    if (err.code === 11000 && err.keyPattern?.referral) {
      return res
        .status(500)
        .json({ message: "Referral code conflict, please try again." });
    }

    res.status(500).json({ message: "Signup failed" });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ message: "phone & password required" });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    const plainUser = user.toObject();
    delete plainUser.password;

    res.json({ token, user: plainUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
}

// GET /api/auth/me
export async function me(req, res) {
  const user = req.user.toObject();
  delete user.password;
  res.json({ user });
}

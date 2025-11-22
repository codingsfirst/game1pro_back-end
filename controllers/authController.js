const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const generateReferralCode = require("../utils/generateReferralCode");

function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// POST /api/auth/signup
exports.signup = async (req, res, next) => {
  try {
    const { username, phone, password, referralCode } = req.body;

    if (!username || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Username, phone and password are required" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "Phone already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      phone,
      passwordHash,
    });

    // set referralCode
    user.referralCode = generateReferralCode(username, user._id);
    await user.save();

    // handle referredBy (if referralCode given)
    if (referralCode) {
      const refUser = await User.findOne({ referralCode });
      if (refUser) {
        user.referredBy = refUser._id;
        await user.save();

        // give referral reward (e.g. 100 PKR) – logic stub now
        refUser.referralCount += 1;
        refUser.referralEarnings += 100; // as per your rule
        // aap decide kar sakte ho ye 100 direct balance me bhi add karna hai ya seperate
        await refUser.save();
      }
    }

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        phone: user.phone,
        balance: user.balance,
        withdrawableBalance: user.withdrawableBalance,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        phone: user.phone,
        balance: user.balance,
        withdrawableBalance: user.withdrawableBalance,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash");
    res.json(user);
  } catch (err) {
    next(err);
  }
};

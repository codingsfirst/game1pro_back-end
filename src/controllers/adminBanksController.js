import { User } from "../models/User.js";

export async function adminGetUserBanks(req, res) {
  try {
    const users = await User.find({
      addedBanks: { $exists: true, $ne: [] }
    }).lean();

    const list = [];

    users.forEach((u) => {
      u.addedBanks.forEach((b) => {
        list.push({
          id: b._id.toString(),
          userId: u.userId,
          userMongoId: u._id.toString(),
          username: u.username,
          phone: u.phone,
          bankName: b.bankName,
          accountTitle: b.accountTitle,
          accountNumber: b.accountNumber,
          createdAt: u.createdAt,
        });
      });
    });

    res.json({ accounts: list });
  } catch (err) {
    console.error("Admin Banks Error:", err);
    res.status(500).json({ message: "Failed to load banks" });
  }
}

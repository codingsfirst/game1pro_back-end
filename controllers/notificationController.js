const Notification = require("../models/Notification");

exports.getMyNotifications = async (req, res, next) => {
  try {
    const list = await Notification.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const n = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!n) return res.status(404).json({ message: "Notification not found" });
    n.read = true;
    await n.save();
    res.json(n);
  } catch (err) {
    next(err);
  }
};

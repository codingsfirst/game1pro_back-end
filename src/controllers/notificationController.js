// GET /api/notifications
export async function listNotifications(req, res) {
  const user = req.user;

  // Agar kuch bhi nahi hai to default 4 notifications send kar dein,
  // jaisa frontend fallback hai.
  if (!user.notifications || user.notifications.length === 0) {
    const defaults = [
      {
        id: 1,
        title: "Welcome to Game1Pro!",
        message: "Your account has been created successfully.",
        time: "Just now",
        read: false
      },
      {
        id: 2,
        title: "Bonus credited",
        message: "You received a welcome bonus. Play responsibly.",
        time: "Today",
        read: false
      }
    ];
    return res.json(defaults);
  }

  const result = user.notifications
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((n, idx) => ({
      id: idx + 1,
      title: n.title,
      message: n.message,
      time: n.time || "Recently",
      read: n.read
    }));

  res.json(result);
}

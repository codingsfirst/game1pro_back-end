import jwt from "jsonwebtoken";

export function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ message: "Admin token required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: "Not admin" });
    }

    req.admin = { id: decoded.id || "ADMIN" };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid admin token" });
  }
}

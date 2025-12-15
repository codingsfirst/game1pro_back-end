import bcrypt from "bcryptjs";
import { Admin } from "../models/Admin.js";

export async function seedAdmin() {
  try {
    const exists = await Admin.findOne({ email: "admin@game1pro.com" });

    if (exists) {
      console.log("⚠️ Admin already exists");
      return;
    }

    const hash = await bcrypt.hash("admin123", 10);

    await Admin.create({
      name: "Main Admin",
      email: "admin@game1pro.com",
      password: hash,
    });

    console.log("✅ ADMIN CREATED → admin@game1pro.com / admin123");
  } catch (err) {
    console.log("❌ Error creating admin");
    console.log(err);
  }
}

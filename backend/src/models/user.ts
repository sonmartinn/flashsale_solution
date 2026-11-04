import { Schema, model } from "mongoose";

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

// email: unique khai báo ở mức trường (không lặp lại bằng schema.index), trim + chữ thường
// được áp dụng trước khi lưu nên " User@Example.COM " và "user@example.com" trùng nhau.
// Không có middleware save: băm mật khẩu nằm ở service (D-10).
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: "user" },
  },
  { collection: "users", timestamps: { createdAt: true, updatedAt: false } },
);

export const User = model("User", userSchema);

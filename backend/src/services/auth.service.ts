import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "../config/index.js";
import { HttpError } from "../middlewares/error.js";
import { User, type UserDocument } from "../models/User.js";

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = "7d";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

// Chỉ trả các trường an toàn, không bao giờ trả passwordHash
function toPublicUser(user: UserDocument) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

// Token chứa sẵn userId và role để kiểm tra quyền không cần tra MongoDB mỗi request
function signToken(user: UserDocument) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: String(user._id),
    expiresIn: TOKEN_TTL,
  });
}

export async function register({ name, email, password }: RegisterInput) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    // Không nhận role từ request: tài khoản đăng ký luôn là user
    const user = await User.create({ name, email, passwordHash });
    return { token: signToken(user), user: toPublicUser(user) };
  } catch (err) {
    // Dựa vào unique index thay vì kiểm tra trước, để hai request đồng thời không lọt
    if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
      throw new HttpError(409, "Email đã được đăng ký");
    }
    throw err;
  }
}

export async function login({ email, password }: LoginInput) {
  const user = await User.findOne({ email });
  // Dùng chung một thông báo để không lộ email nào đã có tài khoản
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Email hoặc mật khẩu không đúng");
  }
  return { token: signToken(user), user: toPublicUser(user) };
}

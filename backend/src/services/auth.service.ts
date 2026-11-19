import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User, type Role } from "../models/index.js";
import { HttpError } from "../utils/http-error.js";
import type { LoginInput, RegisterInput } from "../utils/validate.js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AuthService {
  register(input: RegisterInput): Promise<AuthResponse>;
  login(input: LoginInput): Promise<AuthResponse>;
  signToken(userId: string, role: Role): string;
}

const BCRYPT_COST = 10;
const PASSWORD_MAX_BYTES = 72;

function invalidCredentials(): HttpError {
  // Cùng một body cho email không tồn tại và mật khẩu sai: không lộ email nào đã đăng ký (D-12).
  return new HttpError(401, "Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS");
}

// Hash giả để so sánh khi email không tồn tại, giúp thời gian phản hồi gần giống trường hợp sai mật khẩu.
// Tạo lười một lần rồi dùng lại.
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash("mat-khau-gia-de-can-thoi-gian", BCRYPT_COST);
  return dummyHashPromise;
}

/** Dịch vụ đăng ký / đăng nhập. Băm mật khẩu nằm ở đây, không ở middleware của model (D-10). */
export function createAuthService(deps: { jwtSecret: string }): AuthService {
  const { jwtSecret } = deps;

  // D-13: HS256, hạn 7 ngày, sub = userId (qua tùy chọn subject, không đặt sub trong payload), role trong payload.
  const signToken = (userId: string, role: Role): string =>
    jwt.sign({ role }, jwtSecret, { algorithm: "HS256", expiresIn: "7d", subject: userId });

  const toResponse = (u: { _id: { toString(): string }; name: string; email: string; role: Role }): AuthResponse => {
    const id = u._id.toString();
    return { token: signToken(id, u.role), user: { id, name: u.name, email: u.email, role: u.role } };
  };

  const register = async (input: RegisterInput): Promise<AuthResponse> => {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      // Dựng document tường minh: role luôn là "user", không lấy gì khác từ client.
      const created = await User.create({ name: input.name, email: input.email, passwordHash, role: "user" });
      return toResponse(created);
    } catch (err) {
      // D-11: dựa vào unique index email (E11000), không kiểm tra trước vì sẽ bị chạy đua.
      if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
        throw new HttpError(409, "Email đã được sử dụng", "EMAIL_TAKEN");
      }
      throw err;
    }
  };

  const login = async (input: LoginInput): Promise<AuthResponse> => {
    // Mật khẩu rỗng hoặc quá 72 byte không bao giờ đúng: từ chối ngay, không để bcrypt cắt bớt rồi so khớp.
    if (input.password.length === 0 || Buffer.byteLength(input.password, "utf8") > PASSWORD_MAX_BYTES) {
      throw invalidCredentials();
    }
    const user = await User.findOne({ email: input.email });
    if (user === null) {
      await bcrypt.compare(input.password, await dummyHash());
      throw invalidCredentials();
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw invalidCredentials();
    return toResponse(user);
  };

  return { register, login, signToken };
}

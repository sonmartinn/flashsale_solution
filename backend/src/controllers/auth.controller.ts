import type { Request, Response } from "express";
import { HttpError } from "../middlewares/error.js";
import * as authService from "../services/auth.service.js";

type RequestBody = Record<string, unknown>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt chỉ dùng 72 byte đầu, phần dư sẽ bị bỏ qua
const MAX_PASSWORD_BYTES = 72;

// Bắt buộc là chuỗi: nếu để lọt object như { "$gt": "" } thì nó thành toán tử truy vấn MongoDB
function readEmail(body: RequestBody) {
  const { email } = body;
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    throw new HttpError(400, "Email không hợp lệ");
  }
  return email.trim().toLowerCase();
}

export async function register(req: Request, res: Response) {
  const body: RequestBody = req.body ?? {};
  const email = readEmail(body);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new HttpError(400, "Vui lòng nhập họ tên");

  const { password } = body;
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    throw new HttpError(400, `Mật khẩu không được dài quá ${MAX_PASSWORD_BYTES} byte`);
  }

  res.status(201).json(await authService.register({ name, email, password }));
}

export async function login(req: Request, res: Response) {
  const body: RequestBody = req.body ?? {};
  const email = readEmail(body);
  const { password } = body;
  if (typeof password !== "string" || !password) {
    throw new HttpError(400, "Vui lòng nhập mật khẩu");
  }

  res.json(await authService.login({ email, password }));
}

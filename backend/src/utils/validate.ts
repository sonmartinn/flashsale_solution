import { HttpError } from "./http-error.js";

// Kiểm tra đầu vào đăng ký / đăng nhập (D-10).
// - Mọi trường bắt buộc phải là chuỗi: chặn object toán tử như { "$ne": null } trước khi tới truy vấn.
// - Chỉ đọc đúng các trường cần thiết và trả về object mới: không bao giờ lấy role hay khóa lạ từ client.

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;
const PASSWORD_MIN_CHARS = 6;
/** bcrypt chỉ băm 72 byte đầu, nên giới hạn tính theo byte UTF-8 chứ không theo số ký tự. */
const PASSWORD_MAX_BYTES = 72;

function invalid(message: string): HttpError {
  return new HttpError(400, message, "VALIDATION_ERROR");
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid("Dữ liệu gửi lên phải là một object JSON");
  }
  return body as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== "string") throw invalid(`Trường ${field} phải là chuỗi`);
  return value;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Kiểm tra body đăng ký; trả về { name, email, password } đã chuẩn hóa. */
export function parseRegisterInput(body: unknown): RegisterInput {
  const obj = asObject(body);
  const name = requireString(obj, "name").trim();
  const email = normalizeEmail(requireString(obj, "email"));
  const password = requireString(obj, "password");

  if (name.length < 1 || name.length > NAME_MAX) {
    throw invalid(`Tên phải có từ 1 đến ${NAME_MAX} ký tự`);
  }
  if (!EMAIL_RE.test(email)) {
    throw invalid("Email không hợp lệ");
  }
  if (password.length < PASSWORD_MIN_CHARS || Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw invalid(`Mật khẩu phải có ít nhất ${PASSWORD_MIN_CHARS} ký tự và tối đa ${PASSWORD_MAX_BYTES} byte`);
  }
  return { name, email, password };
}

/**
 * Kiểm tra body đăng nhập: chỉ kiểm tra kiểu và chuẩn hóa email.
 * Mật khẩu sai độ dài được service trả về 401 INVALID_CREDENTIALS như mọi lần đăng nhập sai.
 */
export function parseLoginInput(body: unknown): LoginInput {
  const obj = asObject(body);
  const email = normalizeEmail(requireString(obj, "email"));
  const password = requireString(obj, "password");
  return { email, password };
}

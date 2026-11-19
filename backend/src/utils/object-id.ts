const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Chuẩn hóa ObjectId đầu vào (tham số, header, đối số dòng lệnh).
 * Chỉ nhận chuỗi đúng 24 ký tự hex và trả về dạng chữ thường; mọi giá trị khác
 * (số, object, mảng, header trùng bị nối thành "a, b"...) trả về null.
 */
export function normalizeObjectId(value: unknown): string | null {
  if (typeof value !== "string" || !OBJECT_ID_RE.test(value)) return null;
  return value.toLowerCase();
}

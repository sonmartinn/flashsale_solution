/**
 * Mã lỗi máy đọc được.
 * - Phase 1 (01-CONTEXT D-15): từ VALIDATION_ERROR tới INTERNAL_ERROR.
 * - Phase 2 (02-CONTEXT D-06), năm mã của đường mua: SOLD_OUT (409), ALREADY_BOUGHT (409),
 *   SALE_NOT_ACTIVE (400), STOCK_NOT_LOADED (503), INVALID_MODE (400).
 *   Script đo tải Phase 3 và giao diện Phase 4 đọc các mã này, nên không đổi tên.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_ID"
  | "INVALID_JSON"
  | "DUPLICATE"
  | "EMAIL_TAKEN"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "SOLD_OUT"
  | "ALREADY_BOUGHT"
  | "SALE_NOT_ACTIVE"
  | "STOCK_NOT_LOADED"
  | "INVALID_MODE";

/**
 * Lỗi nghiệp vụ: middleware lỗi trả về đúng status, thông báo (tiếng Việt) và mã này cho client.
 * Handler chỉ cần ném, Express 5 tự chuyển lỗi async tới middleware lỗi.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, message: string, code: ErrorCode) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

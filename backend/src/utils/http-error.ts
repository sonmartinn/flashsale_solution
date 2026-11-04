/**
 * Mã lỗi máy đọc được của Phase 1 (01-CONTEXT D-15).
 * Phase 2 sẽ bổ sung SOLD_OUT, ALREADY_BOUGHT, SALE_NOT_ACTIVE, STOCK_NOT_LOADED, INVALID_MODE.
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
  | "INTERNAL_ERROR";

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

// Phân loại phản hồi của request mua theo status và mã lỗi JSON (D-09).
//
// Lỗi thật chỉ gồm 5xx, lỗi kết nối và timeout (SPECS §10). 409 hết hàng hay đã mua là phản hồi đúng
// của hệ thống dưới tải, không phải lỗi; 401 và các 4xx khác được đếm riêng để luật INVALID xét.

/** Tám nhóm phản hồi, theo thứ tự cố định. */
export const BUCKETS = [
  "s201",
  "s409SoldOut",
  "s409AlreadyBought",
  "s401",
  "sOther4xx",
  "s5xx",
  "connErrors",
  "timeouts",
] as const;

export type Bucket = (typeof BUCKETS)[number];
export type ResponseCounts = Record<Bucket, number>;

/** Bộ đếm mới, mọi nhóm bằng 0. */
export function emptyCounts(): ResponseCounts {
  return {
    s201: 0,
    s409SoldOut: 0,
    s409AlreadyBought: 0,
    s401: 0,
    sOther4xx: 0,
    s5xx: 0,
    connErrors: 0,
    timeouts: 0,
  };
}

/**
 * Nhóm của một phản hồi HTTP. Mọi status đều rơi vào đúng một nhóm: status bất ngờ dưới 500
 * (kể cả 2xx khác 201 hay 3xx) vào sOther4xx, từ 500 trở lên vào s5xx.
 */
export function classifyStatus(status: number, code: string | undefined): Bucket {
  if (status === 201) return "s201";
  if (status === 409) {
    if (code === "SOLD_OUT") return "s409SoldOut";
    if (code === "ALREADY_BOUGHT") return "s409AlreadyBought";
    return "sOther4xx";
  }
  if (status === 401) return "s401";
  if (status >= 500) return "s5xx";
  return "sOther4xx";
}

/** Tên lỗi của một giá trị bị ném (DOMException, Error...), hoặc undefined. */
function errorName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("name" in value)) return undefined;
  return typeof value.name === "string" ? value.name : undefined;
}

function isTimeoutName(name: string | undefined): boolean {
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * Nhóm của một lần fetch bị từ chối. AbortSignal.timeout từ chối bằng DOMException "TimeoutError";
 * lỗi mạng là TypeError("fetch failed") có cause.code (ECONNRESET, ECONNREFUSED, UND_ERR_*) (RESEARCH A3).
 * Mọi giá trị lạ khác cũng tính là lỗi kết nối, để không lỗi nào lọt khỏi realErrors.
 */
export function classifyFetchError(err: unknown): "connErrors" | "timeouts" {
  if (isTimeoutName(errorName(err))) return "timeouts";
  if (typeof err === "object" && err !== null && "cause" in err && isTimeoutName(errorName(err.cause))) {
    return "timeouts";
  }
  return "connErrors";
}

/** Mã lỗi `code` trong thân JSON của phản hồi, hoặc undefined. Không bao giờ ném lỗi. */
export function parseErrorCode(body: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  if (!("code" in parsed)) return undefined;
  return typeof parsed.code === "string" ? parsed.code : undefined;
}

/** Số lỗi thật: 5xx + lỗi kết nối + timeout. 4xx (kể cả 401) không tính (SPECS §10). */
export function realErrors(c: ResponseCounts): number {
  return c.s5xx + c.connErrors + c.timeouts;
}

// Client HTTP cho các API quản trị mà kịch bản đo tải cần (D-06): health, đăng nhập admin, sale đang mở,
// reset kèm mode/totalQty và stats. Chỉ nói chuyện với backend qua HTTP (harness không đọc thẳng DB).
//
// JWT của admin được giữ trong closure, không bao giờ in ra, không ghi vào CSV hay JSON thô (T-03-11).
// Mọi JSON trả về được thu hẹp từng trường bằng typeof, không ép kiểu cả object (PATTERNS "Untrusted JSON").
import { InvalidError, SALE_MODES, type HealthInfo, type SaleMode, type StatsSnapshot } from "./types.js";

/** Thời gian chờ tối đa của một request quản trị. */
const ADMIN_TIMEOUT_MS = 10_000;

const START_HINT = "Hãy chạy `npm run start:test` trong thư mục backend/ ở một terminal khác rồi thử lại.";

export interface AdminClient {
  /** GET /api/health; trả HealthInfo cho cả 200 lẫn 503 (giữ httpStatus để preflight xét). */
  health(): Promise<HealthInfo>;
  /** POST /api/auth/login; lưu token trong closure. */
  login(email: string, password: string): Promise<void>;
  /** Id các đợt sale đang mở (GET /api/sales/active). */
  activeSaleIds(): Promise<string[]>;
  /** POST /api/admin/sales/:id/reset với { mode, totalQty }. */
  reset(saleId: string, body: { mode: SaleMode; totalQty: number }): Promise<{ mode: SaleMode; totalQty: number }>;
  /** GET /api/admin/sales/:id/stats, đủ 12 trường. */
  stats(saleId: string): Promise<StatsSnapshot>;
}

/** Giá trị của khóa `key` khi `value` là object JSON (không phải mảng), ngược lại undefined. */
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

/** Mô tả ngắn một lỗi fetch: mã lỗi mạng (ECONNREFUSED...) hoặc tên lỗi (TimeoutError). */
function describeFetchError(err: unknown): string {
  const cause = field(err, "cause");
  const code = field(cause, "code");
  if (typeof code === "string") return code;
  const name = field(err, "name");
  return typeof name === "string" ? name : "lỗi không rõ";
}

/** "HTTP 409 (SOLD_OUT)" hoặc "HTTP 500": chỉ status và mã lỗi, không bao giờ in thân phản hồi. */
function describeStatus(status: number, json: unknown): string {
  const code = field(json, "code");
  return typeof code === "string" ? `HTTP ${status} (${code})` : `HTTP ${status}`;
}

function isSaleMode(value: unknown): value is SaleMode {
  return typeof value === "string" && SALE_MODES.some((m) => m === value);
}

/** Thu hẹp phần `stats` của phản hồi; thiếu hay sai kiểu một trường là backend chưa có stats của Phase 3. */
function narrowStats(raw: unknown): StatsSnapshot {
  const missing: string[] = [];
  const num = (key: string): number => {
    const v = field(raw, key);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    missing.push(key);
    return 0;
  };
  const str = (key: string): string => {
    const v = field(raw, key);
    if (typeof v === "string") return v;
    missing.push(key);
    return "";
  };
  const bool = (key: string): boolean => {
    const v = field(raw, key);
    if (typeof v === "boolean") return v;
    missing.push(key);
    return false;
  };

  const rawMode = field(raw, "mode");
  let mode: SaleMode = "v0";
  if (isSaleMode(rawMode)) mode = rawMode;
  else missing.push("mode");

  const rawRedisStock = field(raw, "redisStock");
  let redisStock: number | null = null;
  if (typeof rawRedisStock === "number" && Number.isFinite(rawRedisStock)) redisStock = rawRedisStock;
  else if (rawRedisStock !== null) missing.push("redisStock");

  const rawInSync = field(raw, "redisInSync");
  let redisInSync: boolean | null = null;
  if (typeof rawInSync === "boolean") redisInSync = rawInSync;
  else if (rawInSync !== null) missing.push("redisInSync");

  const stats: StatsSnapshot = {
    saleId: str("saleId"),
    mode,
    status: str("status"),
    totalQty: num("totalQty"),
    mongoRemaining: num("mongoRemaining"),
    redisStock,
    redisBuyers: num("redisBuyers"),
    orders: num("orders"),
    distinctUsers: num("distinctUsers"),
    oversold: num("oversold"),
    redisInSync,
    uniqueOrderIndex: bool("uniqueOrderIndex"),
  };
  if (missing.length > 0) {
    throw new InvalidError(
      `Stats của backend thiếu hoặc sai kiểu trường: ${missing.join(", ")}. Backend chưa có stats của Phase 3 ` +
        "(ví dụ uniqueOrderIndex): hãy cập nhật mã và build lại backend.",
    );
  }
  return stats;
}

/** Tạo client quản trị cho backend ở `baseUrl` (chỉ origin, ví dụ http://127.0.0.1:5000). */
export function createAdminClient(baseUrl: string): AdminClient {
  let token: string | null = null;

  async function request(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; auth?: boolean } = {},
  ): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.auth === true) {
      if (token === null) throw new Error("Chưa đăng nhập admin trước khi gọi API quản trị");
      headers["authorization"] = `Bearer ${token}`;
    }
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
      });
    } catch (err) {
      throw new InvalidError(`Không gọi được backend tại ${baseUrl} (${describeFetchError(err)}). ${START_HINT}`);
    }
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      throw new InvalidError(`Mất kết nối khi đọc phản hồi ${method} ${path} (${describeFetchError(err)}).`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  }

  /** Gọi API quản trị (có token); mọi status không phải 2xx là INVALID. */
  async function adminCall(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const { status, json } = await request(method, path, { auth: true, ...(body !== undefined ? { body } : {}) });
    if (status < 200 || status > 299) {
      throw new InvalidError(`${method} ${path} thất bại: ${describeStatus(status, json)}`);
    }
    return json;
  }

  return {
    async health(): Promise<HealthInfo> {
      const { status, json } = await request("GET", "/api/health");
      if (status !== 200 && status !== 503) {
        throw new InvalidError(`GET /api/health trả về ${describeStatus(status, json)}, không phải backend flash sale.`);
      }
      const mongo = field(json, "mongo");
      const redis = field(json, "redis");
      const testMode = field(json, "testMode");
      const maxPoolSize = field(json, "maxPoolSize");
      if (typeof mongo !== "boolean" || typeof redis !== "boolean" || typeof testMode !== "boolean") {
        throw new InvalidError("GET /api/health thiếu trường mongo/redis/testMode: backend quá cũ hoặc không đúng dịch vụ.");
      }
      return {
        httpStatus: status,
        mongo,
        redis,
        testMode,
        maxPoolSize: typeof maxPoolSize === "number" && Number.isFinite(maxPoolSize) ? maxPoolSize : null,
      };
    },

    async login(email: string, password: string): Promise<void> {
      const { status, json } = await request("POST", "/api/auth/login", { body: { email, password } });
      if (status !== 200) {
        throw new InvalidError(
          `Đăng nhập admin thất bại: ${describeStatus(status, json)}. Kiểm tra LOADTEST_ADMIN_EMAIL/LOADTEST_ADMIN_PASSWORD ` +
            "hoặc chạy `npm run seed` trong backend/.",
        );
      }
      const t = field(json, "token");
      if (typeof t !== "string" || t.length === 0) {
        throw new InvalidError("Phản hồi đăng nhập không có token.");
      }
      token = t;
    },

    async activeSaleIds(): Promise<string[]> {
      const { status, json } = await request("GET", "/api/sales/active");
      if (status !== 200) {
        throw new InvalidError(`GET /api/sales/active thất bại: ${describeStatus(status, json)}`);
      }
      const sales = field(json, "sales");
      if (!Array.isArray(sales)) throw new InvalidError("GET /api/sales/active không có mảng sales.");
      const ids: string[] = [];
      for (const sale of sales) {
        const id = field(sale, "id");
        if (typeof id !== "string") throw new InvalidError("Một đợt sale trong /api/sales/active không có id.");
        ids.push(id);
      }
      return ids;
    },

    async reset(saleId, body): Promise<{ mode: SaleMode; totalQty: number }> {
      const path = `/api/admin/sales/${encodeURIComponent(saleId)}/reset`;
      const json = await adminCall("POST", path, { mode: body.mode, totalQty: body.totalQty });
      const sale = field(json, "sale");
      const mode = field(sale, "mode");
      const totalQty = field(sale, "totalQty");
      if (!isSaleMode(mode) || typeof totalQty !== "number") {
        throw new InvalidError("Phản hồi reset thiếu mode/totalQty: backend chưa hỗ trợ reset kèm totalQty (Phase 3).");
      }
      return { mode, totalQty };
    },

    async stats(saleId): Promise<StatsSnapshot> {
      const json = await adminCall("GET", `/api/admin/sales/${encodeURIComponent(saleId)}/stats`);
      return narrowStats(field(json, "stats"));
    },
  };
}

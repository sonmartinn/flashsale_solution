// Cấu hình dòng lệnh của E1 và E3 (D-03, D-17, D-19).
//
// Hàm thuần: nhận argv và env làm tham số, không tự đọc biến môi trường toàn cục, nên test không phụ
// thuộc máy chạy. Kịch bản truyền env của tiến trình vào. Tham số sai bị từ chối trước khi bắn tải.
import { parseArgs } from "node:util";

/** Tham số hoặc biến môi trường không hợp lệ: kịch bản in thông báo kèm dòng cách dùng rồi thoát mã 2. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface CommonConfig {
  /** Gốc URL của backend (chỉ origin, không có đường dẫn) */
  baseUrl: string;
  /** Sale được chỉ định bằng --sale (24 hex thường), hoặc null để tự tìm sale đang mở */
  saleId: string | null;
  runs: number;
  adminEmail: string;
  adminPassword: string;
}

export interface E1Config extends CommonConfig {
  users: number;
  stock: number;
  /** true khi runs, users hoặc stock khác mặc định; được ghi vào mọi dòng CSV (D-17) */
  nonDefault: boolean;
}

export type E3Config = CommonConfig;

/** Nguồn biến môi trường: env của tiến trình do kịch bản truyền vào, hoặc object giả trong test. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** Mặc định của E1: 5 lượt mỗi mode, 1000 user, tồn kho 100 (D-17). */
export const E1_DEFAULTS = { runs: 5, users: 1000, stock: 100 } as const;
/** E3 cố định: tồn kho 100, một user gửi 10 request đồng thời (D-19). */
export const E3_STOCK = 100;
export const E3_REQUESTS = 10;
const E3_DEFAULT_RUNS = 5;

export const E1_USAGE =
  "Cách dùng: npm run e1 -- [--runs n] [--users n] [--stock n] [--sale id] [--base-url url]";
export const E3_USAGE = "Cách dùng: npm run e3 -- [--runs n] [--sale id] [--base-url url]";

const DEFAULT_BASE_URL = "http://127.0.0.1:5000";
/** Tài khoản admin do seed tạo (Phase 1 D-04). */
const DEFAULT_ADMIN_EMAIL = "admin@flashsale.local";
const DEFAULT_ADMIN_PASSWORD = "matkhau123";

const RUNS_MAX = 100;
const USERS_MIN = 2;
const USERS_MAX = 100_000;
const STOCK_MAX = 1_000_000;

type OptionSpec = Record<string, { type: "string" }>;

/**
 * parseArgs ở chế độ strict (từ chối cờ lạ và tham số vị trí), bọc lỗi tiếng Anh thành ConfigError
 * tiếng Việt. Đây là CLI, không phải handler Express, nên try/catch cục bộ là hợp lệ.
 */
function parseStrict(argv: string[], options: OptionSpec): Record<string, string | undefined> {
  try {
    const { values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false });
    const out: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(values)) {
      out[key] = typeof value === "string" ? value : undefined;
    }
    return out;
  } catch (err) {
    throw new ConfigError(`Tham số không hợp lệ: ${(err as Error).message}`);
  }
}

/** Số nguyên dương viết chuẩn (không dấu, không số 0 ở đầu) trong khoảng [min, max]. */
function parseBoundedInt(flag: string, raw: string, min: number, max: number): number {
  if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw new ConfigError(`--${flag} phải là số nguyên từ ${min} đến ${max}, nhận "${raw}"`);
  }
  return Number(raw);
}

/** Giá trị env đã bỏ khoảng trắng hai đầu, hoặc undefined khi không có hay rỗng. */
function envValue(env: EnvSource, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim().length === 0) return undefined;
  return raw.trim();
}

function parseBaseUrl(raw: string, source: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${source} phải là URL http(s) hợp lệ, nhận "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`${source} phải dùng http hoặc https, nhận "${raw}"`);
  }
  return url.origin;
}

function parseSale(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (!/^[0-9a-fA-F]{24}$/.test(raw)) {
    throw new ConfigError(`--sale phải là ObjectId 24 ký tự hex, nhận "${raw}"`);
  }
  return raw.toLowerCase();
}

/** Phần chung của E1 và E3: base URL, sale, số lượt và tài khoản admin. */
function parseCommon(values: Record<string, string | undefined>, env: EnvSource, defaultRuns: number): CommonConfig {
  const flagUrl = values["base-url"];
  const envUrl = envValue(env, "LOADTEST_BASE_URL");
  let baseUrl = DEFAULT_BASE_URL;
  if (flagUrl !== undefined) baseUrl = parseBaseUrl(flagUrl, "--base-url");
  else if (envUrl !== undefined) baseUrl = parseBaseUrl(envUrl, "LOADTEST_BASE_URL");

  const rawRuns = values["runs"];
  const runs = rawRuns === undefined ? defaultRuns : parseBoundedInt("runs", rawRuns, 1, RUNS_MAX);

  // Mật khẩu chỉ đến từ env hoặc mặc định của seed, và không bao giờ xuất hiện trong thông báo lỗi.
  // Giữ nguyên mật khẩu như đã đặt (không cắt khoảng trắng), chỉ coi chuỗi toàn khoảng trắng là chưa đặt.
  const rawPassword = env["LOADTEST_ADMIN_PASSWORD"];
  return {
    baseUrl,
    saleId: parseSale(values["sale"]),
    runs,
    adminEmail: envValue(env, "LOADTEST_ADMIN_EMAIL") ?? DEFAULT_ADMIN_EMAIL,
    adminPassword:
      rawPassword !== undefined && rawPassword.trim().length > 0 ? rawPassword : DEFAULT_ADMIN_PASSWORD,
  };
}

/** Cấu hình E1: cờ --base-url, --sale, --runs, --users, --stock (D-17). */
export function parseE1Args(argv: string[], env: EnvSource): E1Config {
  const values = parseStrict(argv, {
    "base-url": { type: "string" },
    sale: { type: "string" },
    runs: { type: "string" },
    users: { type: "string" },
    stock: { type: "string" },
  });
  const common = parseCommon(values, env, E1_DEFAULTS.runs);
  const rawUsers = values["users"];
  const rawStock = values["stock"];
  const users = rawUsers === undefined ? E1_DEFAULTS.users : parseBoundedInt("users", rawUsers, USERS_MIN, USERS_MAX);
  const stock = rawStock === undefined ? E1_DEFAULTS.stock : parseBoundedInt("stock", rawStock, 1, STOCK_MAX);
  if (users <= stock) {
    // V0 cần nhiều người mua hơn tồn kho để có thể bán quá, V1/V2 cần đủ người để bán hết
    throw new ConfigError(`--users (${users}) phải lớn hơn --stock (${stock})`);
  }
  return {
    ...common,
    users,
    stock,
    nonDefault: common.runs !== E1_DEFAULTS.runs || users !== E1_DEFAULTS.users || stock !== E1_DEFAULTS.stock,
  };
}

/** Cấu hình E3: chỉ có --base-url, --sale, --runs; tồn kho và số request cố định (D-19). */
export function parseE3Args(argv: string[], env: EnvSource): E3Config {
  const values = parseStrict(argv, {
    "base-url": { type: "string" },
    sale: { type: "string" },
    runs: { type: "string" },
  });
  return parseCommon(values, env, E3_DEFAULT_RUNS);
}

// Cấu hình dòng lệnh của E1, E2 và E3 (D-03, D-17, D-19, D-21, D-24).
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

export interface E4Config extends CommonConfig {
  stock: number;
  concurrency: number;
}

export interface E2Config extends CommonConfig {
  /** S: tồn kho mỗi lượt = số request của pha in_stock (D-21) */
  stock: number;
  /** M: số request của pha sold_out (D-21) */
  soldoutRequests: number;
  /** Các mức connection, đo theo đúng thứ tự này (D-24) */
  connections: number[];
  /** Chạy thử: cho phép cấu hình nhỏ, mọi dòng CSV ghi "smoke" (D-33) */
  smoke: boolean;
}

/** Nguồn biến môi trường: env của tiến trình do kịch bản truyền vào, hoặc object giả trong test. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** Mặc định của E1: 5 lượt mỗi mode, 1000 user, tồn kho 100 (D-17). */
export const E1_DEFAULTS = { runs: 5, users: 1000, stock: 100 } as const;
/** E3 cố định: tồn kho 100, một user gửi 10 request đồng thời (D-19). */
export const E3_STOCK = 100;
export const E3_REQUESTS = 10;
const E3_DEFAULT_RUNS = 5;

/** Mặc định của E2: 5 lượt đo mỗi mode mỗi mức, S = M = 5000, connection 100 -> 300 -> 500 (D-21, D-22, D-24). */
export const E2_DEFAULTS = {
  runs: 5,
  stock: 5000,
  soldoutRequests: 5000,
  connections: [100, 300, 500],
} as const;
/** Cỡ lượt khởi động không ghi CSV trước mỗi khối (mức connection x mode): S = M = 1000 (D-24). */
export const E2_WARMUP = 1000;
/** S tối thiểu khi không có --smoke (SPECS §10: tồn kho >= 1000). */
const E2_MIN_STOCK = 1000;
const E2_MAX_CONNECTIONS = 1000;

export const E2_USAGE =
  "Cách dùng: npm run e2 -- [--runs n] [--stock n] [--soldout-requests n] [--sale id] [--base-url url] " +
  "[--smoke [--connections 100,500]]";

export const E1_USAGE =
  "Cách dùng: npm run e1 -- [--runs n] [--users n] [--stock n] [--sale id] [--base-url url]";
export const E3_USAGE = "Cách dùng: npm run e3 -- [--runs n] [--sale id] [--base-url url]";
export const E4_DEFAULTS = { runs: 1, stock: 1000, concurrency: 50 } as const;
export const E4_STOP_RATIO = 0.3;
export const E4_HOLD_MS = 5000;
export const E4_HEALTH_TIMEOUT_MS = 90_000;
export const E4_USAGE =
  "Cách dùng: npm run e4 -- [--runs n] [--stock n] [--concurrency n] [--sale id] [--base-url url]";

const DEFAULT_BASE_URL = "http://127.0.0.1:5000";
/** Tài khoản admin do seed tạo (Phase 1 D-04). */
const DEFAULT_ADMIN_EMAIL = "admin@flashsale.local";
const DEFAULT_ADMIN_PASSWORD = "matkhau123";

const RUNS_MAX = 100;
const USERS_MIN = 2;
const USERS_MAX = 100_000;
const STOCK_MAX = 1_000_000;

type OptionSpec = Record<string, { type: "string" } | { type: "boolean" }>;

/**
 * parseArgs ở chế độ strict (từ chối cờ lạ và tham số vị trí), bọc lỗi tiếng Anh thành ConfigError
 * tiếng Việt. Đây là CLI, không phải handler Express, nên try/catch cục bộ là hợp lệ.
 */
function parseStrict(argv: string[], options: OptionSpec): Record<string, string | undefined> {
  try {
    const { values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false });
    const out: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(values)) {
      // Cờ boolean (ví dụ --smoke) có mặt thì thành "true"; cờ chuỗi giữ nguyên giá trị
      if (typeof value === "string") out[key] = value;
      else if (value === true) out[key] = "true";
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

/** Cấu hình E4: tải vừa phải, ngắt MongoDB khi đã bán 30% tồn kho. */
export function parseE4Args(argv: string[], env: EnvSource): E4Config {
  const values = parseStrict(argv, {
    "base-url": { type: "string" },
    sale: { type: "string" },
    runs: { type: "string" },
    stock: { type: "string" },
    concurrency: { type: "string" },
  });
  const common = parseCommon(values, env, E4_DEFAULTS.runs);
  const stock =
    values.stock === undefined ? E4_DEFAULTS.stock : parseBoundedInt("stock", values.stock, 10, STOCK_MAX);
  const concurrency =
    values.concurrency === undefined
      ? E4_DEFAULTS.concurrency
      : parseBoundedInt("concurrency", values.concurrency, 1, 500);
  return { ...common, stock, concurrency };
}

/** Danh sách connection "100,300,500": mỗi phần tử là số nguyên 1..1000, không trùng. */
function parseConnections(raw: string): number[] {
  const parts = raw.split(",");
  const out: number[] = [];
  for (const part of parts) {
    const value = parseBoundedInt("connections", part.trim(), 1, E2_MAX_CONNECTIONS);
    if (out.includes(value)) throw new ConfigError(`--connections có giá trị trùng: ${value}`);
    out.push(value);
  }
  return out;
}

/**
 * Cấu hình E2: --base-url, --sale, --runs, --stock, --soldout-requests, --connections, --smoke (D-21, D-24).
 * Cấu hình nhỏ hơn chuẩn (stock < 1000, runs < 5, danh sách connection khác mặc định) chỉ được phép khi có
 * --smoke. Mỗi pha cần ít nhất bằng số connection lớn nhất, vì autocannon ném lỗi khi amount < connections.
 */
export function parseE2Args(argv: string[], env: EnvSource): E2Config {
  const values = parseStrict(argv, {
    "base-url": { type: "string" },
    sale: { type: "string" },
    runs: { type: "string" },
    stock: { type: "string" },
    "soldout-requests": { type: "string" },
    connections: { type: "string" },
    smoke: { type: "boolean" },
  });
  const common = parseCommon(values, env, E2_DEFAULTS.runs);
  const smoke = values["smoke"] === "true";
  const rawStock = values["stock"];
  const rawSoldout = values["soldout-requests"];
  const rawConnections = values["connections"];
  const stock = rawStock === undefined ? E2_DEFAULTS.stock : parseBoundedInt("stock", rawStock, 1, STOCK_MAX);
  const soldoutRequests =
    rawSoldout === undefined
      ? E2_DEFAULTS.soldoutRequests
      : parseBoundedInt("soldout-requests", rawSoldout, 1, STOCK_MAX);
  const connections = rawConnections === undefined ? [...E2_DEFAULTS.connections] : parseConnections(rawConnections);

  const isDefaultList =
    connections.length === E2_DEFAULTS.connections.length &&
    connections.every((c, i) => c === E2_DEFAULTS.connections[i]);
  if (!smoke) {
    if (stock < E2_MIN_STOCK) {
      throw new ConfigError(`--stock (${stock}) nhỏ hơn ${E2_MIN_STOCK} chỉ được phép khi chạy thử với --smoke`);
    }
    if (common.runs < E2_DEFAULTS.runs) {
      throw new ConfigError(`--runs (${common.runs}) nhỏ hơn ${E2_DEFAULTS.runs} chỉ được phép khi chạy thử với --smoke`);
    }
    if (!isDefaultList) {
      throw new ConfigError(
        `--connections khác ${E2_DEFAULTS.connections.join(",")} chỉ được phép khi chạy thử với --smoke`,
      );
    }
  }
  const maxConnections = Math.max(...connections);
  if (stock < maxConnections) {
    throw new ConfigError(`--stock (${stock}) phải >= số connection lớn nhất (${maxConnections})`);
  }
  if (soldoutRequests < maxConnections) {
    throw new ConfigError(`--soldout-requests (${soldoutRequests}) phải >= số connection lớn nhất (${maxConnections})`);
  }
  return { ...common, stock, soldoutRequests, connections, smoke };
}

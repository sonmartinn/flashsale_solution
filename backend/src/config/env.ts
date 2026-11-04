import "dotenv/config"; // nạp backend/.env (theo thư mục chạy); không ghi đè biến đã có sẵn

// Quy tắc của module này:
// - Không đọc biến môi trường ở cấp module, chỉ đọc bên trong hàm (import ESM được hoist).
// - Không ném lỗi lúc import: seed/reset dùng loadBaseConfig() mà không cần JWT_SECRET.
// - Đây là nơi DUY NHẤT trong src đọc biến môi trường và quyết định chế độ test.

/** Lỗi cấu hình: server/CLI bắt lỗi này rồi thoát với mã 1 và thông báo tiếng Việt. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface BaseConfig {
  port: number;
  mongoUri: string;
  /** "host:port/db", không chứa thông tin đăng nhập, dùng để in ra màn hình */
  mongoTarget: string;
  redisUrl: string;
  /** "host:port" hoặc "host:port/db" khi db khác 0 */
  redisTarget: string;
  clientOrigin: string;
  mongoMaxPoolSize: number;
  nodeEnv: string;
  isTestMode: boolean;
}

const MONGO_URI_EXAMPLE = "mongodb://127.0.0.1:27018/flashsale";
const WINDOWS_MONGO_PORT = 27017;

/**
 * Kiểm tra MONGODB_URI và trả về "host:port/db" để in banner.
 * Từ chối cổng 27017 (kể cả khi không ghi cổng) vì đó là dịch vụ MongoDB có sẵn của Windows.
 */
export function parseMongoUri(uri: string): string {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    throw new ConfigError(`MONGODB_URI không hợp lệ: chỉ hỗ trợ dạng mongodb://host:port/db, ví dụ ${MONGO_URI_EXAMPLE}.`);
  }
  if (u.protocol !== "mongodb:") {
    throw new ConfigError(`MONGODB_URI phải bắt đầu bằng mongodb:// (nhận ${u.protocol}). Dùng ${MONGO_URI_EXAMPLE}.`);
  }
  const port = u.port === "" ? WINDOWS_MONGO_PORT : Number(u.port);
  if (port === WINDOWS_MONGO_PORT) {
    throw new ConfigError(
      `MONGODB_URI trỏ tới cổng 27017 (dịch vụ MongoDB của Windows, sai dữ liệu). MongoDB của dự án ở cổng 27018: dùng ${MONGO_URI_EXAMPLE}.`,
    );
  }
  const db = u.pathname.replace(/^\//, "");
  if (db === "") {
    throw new ConfigError(`MONGODB_URI thiếu tên database, ví dụ ${MONGO_URI_EXAMPLE}.`);
  }
  return `${u.hostname}:${port}/${db}`;
}

/** Kiểm tra REDIS_URL và trả về "host:port" (thêm "/db" khi db khác 0). */
export function parseRedisUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ConfigError("REDIS_URL không hợp lệ: chỉ hỗ trợ dạng redis://host:port/db, ví dụ redis://127.0.0.1:6379.");
  }
  if (u.protocol !== "redis:") {
    throw new ConfigError(`REDIS_URL phải bắt đầu bằng redis:// (nhận ${u.protocol}).`);
  }
  const port = u.port === "" ? 6379 : Number(u.port);
  const dbPart = u.pathname.replace(/^\//, "");
  if (dbPart !== "" && !/^[0-9]+$/.test(dbPart)) {
    throw new ConfigError(`REDIS_URL có chỉ số db không hợp lệ: "${dbPart}" (phải là số nguyên).`);
  }
  const db = dbPart === "" ? 0 : Number(dbPart);
  return db === 0 ? `${u.hostname}:${port}` : `${u.hostname}:${port}/${db}`;
}

function requireVar(env: NodeJS.ProcessEnv, name: string, hint: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(`Thiếu biến môi trường ${name}. ${hint}`);
  }
  return value.trim();
}

function optionalVar(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim();
}

/** Đọc cấu hình chung cho server và CLI (không gồm JWT_SECRET). Đọc tại thời điểm gọi. */
export function loadBaseConfig(env: NodeJS.ProcessEnv = process.env): BaseConfig {
  const mongoUri = requireVar(env, "MONGODB_URI", `Đặt MONGODB_URI=${MONGO_URI_EXAMPLE} trong backend/.env (xem .env.example).`);
  const mongoTarget = parseMongoUri(mongoUri);
  const redisUrl = requireVar(env, "REDIS_URL", "Đặt REDIS_URL=redis://127.0.0.1:6379 trong backend/.env (xem .env.example).");
  const redisTarget = parseRedisUrl(redisUrl);

  const rawPort = optionalVar(env, "PORT");
  let port = 5000;
  if (rawPort !== undefined) {
    port = /^[0-9]+$/.test(rawPort) ? Number(rawPort) : NaN;
    if (!(port >= 1 && port <= 65535)) {
      throw new ConfigError(`PORT phải là số nguyên từ 1 đến 65535 (nhận "${rawPort}").`);
    }
  }

  const clientOrigin = optionalVar(env, "CLIENT_ORIGIN") ?? "http://localhost:5173";

  const rawPool = optionalVar(env, "MONGO_MAX_POOL_SIZE");
  let mongoMaxPoolSize = 100;
  if (rawPool !== undefined) {
    if (!/^[1-9][0-9]*$/.test(rawPool)) {
      throw new ConfigError(`MONGO_MAX_POOL_SIZE phải là số nguyên dương (nhận "${rawPool}").`);
    }
    mongoMaxPoolSize = Number(rawPool);
  }

  // nodeEnv đã trim, CHỈ dùng để hiển thị (banner khởi động, GET /api/health).
  const nodeEnv = optionalVar(env, "NODE_ENV") ?? "development";
  // Kiểm tra chế độ test DUY NHẤT của cả backend (D-14, AUTH-05).
  // So sánh giá trị THÔ, đúng chính xác "test": không trim, không đổi hoa thường. Nhờ vậy giá trị như
  // "test " (do `set NODE_ENV=test && ...` trong cmd tạo ra) KHÔNG bật chế độ test và header x-test-user.
  const isTestMode = env["NODE_ENV"] === "test";

  return { port, mongoUri, mongoTarget, redisUrl, redisTarget, clientOrigin, mongoMaxPoolSize, nodeEnv, isTestMode };
}

/** Đọc JWT_SECRET (chỉ server gọi). Không có giá trị mặc định và không bao giờ in giá trị ra. */
export function loadJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env["JWT_SECRET"];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(
      "Thiếu biến môi trường JWT_SECRET. Đặt JWT_SECRET trong backend/.env (tạo bằng: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\").",
    );
  }
  return value;
}

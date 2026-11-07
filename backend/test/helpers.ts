// Bộ công cụ dùng chung cho mọi file test của backend.
//
// Quy ước cho cả phase: mỗi file test bọc toàn bộ case trong MỘT describe cấp cao nhất đặt tên
// theo tên file (không có đuôi .ts), ví dụ describe("health.test", ...). Nhờ đó báo cáo của
// node:test ghi rõ file nào đã chạy, và bước kiểm tra có thể xác nhận một file thật sự được chạy.
//
// Cách ly dữ liệu: test không bao giờ đụng vào database demo "flashsale" hay Redis db 0.
// - MongoDB: mỗi file dùng database riêng flashsale_test_<tên>_<pid> và tự xóa trong after().
// - Redis: mỗi file integration giữ một chỉ số db từ 1 đến 15.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import type { Redis } from "ioredis";
import { createApp, type AppDeps } from "../src/app.js";
import type { BaseConfig } from "../src/config/env.js";
import { connectMongo } from "../src/config/db.js";
import { connectRedis, createRedis } from "../src/config/redis.js";

/** Thư mục backend/ (đường dẫn tuyệt đối, có dấu phân cách ở cuối). */
export const BACKEND_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Khóa JWT chỉ dùng cho test (dài hơn 32 ký tự để server không cảnh báo khóa yếu). */
export const TEST_JWT_SECRET = "khoa-jwt-chi-dung-cho-test-0123456789abcdef";

const TEST_DB_PREFIX = "flashsale_test_";

/** URI MongoDB riêng cho một file test, duy nhất theo tiến trình (các worktree song song không đụng nhau). */
export function testMongoUri(name: string): string {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error(`Tên database test không hợp lệ: "${name}"`);
  return `mongodb://127.0.0.1:27018/${TEST_DB_PREFIX}${name}_${process.pid}`;
}

/** URL Redis cho test; db 0 là dữ liệu demo nên chỉ cho phép 1..15. */
export function testRedisUrl(db: number): string {
  if (!Number.isInteger(db) || db < 1 || db > 15) {
    throw new Error(`Redis db cho test phải từ 1 đến 15 (nhận ${db}); db 0 là dữ liệu demo.`);
  }
  return `redis://127.0.0.1:6379/${db}`;
}

/** Dựng BaseConfig trực tiếp (không đọc biến môi trường). */
export function testConfig(overrides: Partial<BaseConfig> = {}): BaseConfig {
  const dbName = `${TEST_DB_PREFIX}app_${process.pid}`;
  return {
    port: 0,
    mongoUri: `mongodb://127.0.0.1:27018/${dbName}`,
    mongoTarget: `127.0.0.1:27018/${dbName}`,
    redisUrl: testRedisUrl(1),
    redisTarget: "127.0.0.1:6379/1",
    clientOrigin: "http://localhost:5173",
    mongoMaxPoolSize: 100,
    nodeEnv: "development",
    isTestMode: false,
    testModeNearMiss: false,
    ...overrides,
  };
}

/** Lấy một cổng đang trống trên 127.0.0.1. */
export async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        srv.close();
        reject(new Error("Không đọc được cổng trống"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

export interface StartedApp {
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Chạy createApp trong cùng tiến trình test, lắng nghe 127.0.0.1 cổng ngẫu nhiên.
 * Mặc định: testConfig(), TEST_JWT_SECRET và một client Redis db 1 CHƯA kết nối.
 */
export async function startApp(deps: Partial<AppDeps> = {}): Promise<StartedApp> {
  const ownRedis = deps.redis === undefined ? createRedis(testRedisUrl(1)) : undefined;
  const app = createApp({
    cfg: deps.cfg ?? testConfig(),
    jwtSecret: deps.jwtSecret ?? TEST_JWT_SECRET,
    redis: deps.redis ?? (ownRedis as Redis),
  });
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve(s);
    });
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("Không đọc được địa chỉ server test");
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ownRedis?.disconnect();
    },
  };
}

// Các biến môi trường mà server đọc: luôn xóa khỏi môi trường kế thừa rồi mới áp giá trị của test,
// để test không vô tình dùng giá trị thật của máy (hay của backend/.env đã được dotenv nạp).
const SERVER_ENV_KEYS = ["MONGODB_URI", "REDIS_URL", "JWT_SECRET", "PORT", "NODE_ENV", "MONGO_MAX_POOL_SIZE", "CLIENT_ORIGIN"];

function buildChildEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (SERVER_ENV_KEYS.includes(key.toUpperCase())) delete childEnv[key];
  }
  return { ...childEnv, ...env };
}

const SERVER_ENTRY = path.join(BACKEND_ROOT, "dist", "server.js");

/**
 * Giá trị mong đợi của script "start:test" trong backend/package.json (G-01-9, D-20).
 * build.test so khớp package.json với hằng này. startTestArgv suy ra argv của launcher "start:test" từ chính
 * hằng này, và build.test kiểm tra phép suy ra đó từng token. Vì vậy sửa script và hằng cùng lúc sẽ đổi thứ
 * mà test tích hợp thật sự khởi động.
 */
export const START_TEST_SCRIPT = "npm run build && dotenv run -q --override -f .env.test -- node dist/server.js";

/**
 * File CLI của gói dotenv (trường bin.dotenv trong package.json của nó): chính là file npm liên kết thành
 * node_modules/.bin/dotenv. Helper chạy file này bằng process.execPath vì các shim trong .bin là script shell.
 */
export const DOTENV_CLI = resolveDotenvCli();

function resolveDotenvCli(): string {
  const pkgPath = fileURLToPath(import.meta.resolve("dotenv/package.json"));
  const pkg: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
  const bin = typeof pkg === "object" && pkg !== null ? (pkg as { bin?: unknown }).bin : undefined;
  const cli = typeof bin === "object" && bin !== null ? (bin as { dotenv?: unknown }).dotenv : undefined;
  if (typeof cli !== "string") throw new Error(`Không tìm thấy bin.dotenv trong ${pkgPath}`);
  return path.resolve(path.dirname(pkgPath), cli);
}

// Ký tự được phép trong một token: tách theo khoảng trắng không phát lại được dấu nháy hay ký tự đặc biệt của shell.
const START_TEST_TOKEN = /^[A-Za-z0-9._/=-]+$/;

/**
 * Suy ra argv (sau process.execPath) của launcher "start:test" từ một script start:test, thường là START_TEST_SCRIPT.
 *
 * Các đoạn ngăn bởi && đứng trước đoạn cuối phải đúng là npm run build và được bỏ qua: script test và test:int
 * đã chạy npm run build trước khi helper nào chạy. Đoạn cuối được tách theo khoảng trắng và ánh xạ một-một, giữ
 * nguyên thứ tự:
 * - token đầu tiên dotenv -> DOTENV_CLI (file CLI của gói dotenv, chạy bằng process.execPath);
 * - node -> process.execPath, tức Node đang chạy test. npm tìm node trên PATH, trong dùng bình thường là cùng một
 *   bản cài; đây là chỗ lệch có chủ ý và được ghi lại (REVIEW WR-02);
 * - .env.test -> đường dẫn tuyệt đối trong backend/, dist/server.js -> SERVER_ENTRY (tuyệt đối), vì tiến trình con
 *   chạy trong thư mục tạm để dotenv/config không nạp được backend/.env;
 * - mọi token khác (kể cả mọi cờ) giữ nguyên văn.
 *
 * Ném Error khi: có bước chạy trước khác npm run build; một token chứa ký tự ngoài chữ, số, dấu chấm, gạch dưới,
 * gạch chéo, dấu bằng và gạch nối (dấu nháy, ký tự đặc biệt của shell); token đầu không phải dotenv; hoặc không
 * có dist/server.js (helper chờ /api/health của server đã biên dịch).
 */
export function startTestArgv(script: string): string[] {
  const fail = (detail: string): never => {
    throw new Error(
      `Không phát lại được script start:test "${script}": ${detail}. ` +
        "Phải sửa serverArgv/startTestArgv cùng lúc với script.",
    );
  };
  const segments = script.split("&&").map((segment) => segment.trim());
  const last = segments.pop() ?? "";
  for (const pre of segments) {
    if (pre !== "npm run build") fail(`bước chạy trước "${pre}" không phải npm run build`);
  }
  const tokens = last.split(/\s+/).filter((token) => token !== "");
  for (const token of tokens) {
    if (!START_TEST_TOKEN.test(token)) fail(`token "${token}" có dấu nháy hoặc ký tự đặc biệt của shell`);
  }
  if (tokens[0] !== "dotenv") fail(`launcher "${tokens[0] ?? ""}" không phải dotenv`);
  if (!tokens.includes("dist/server.js")) fail("không chạy dist/server.js");
  return tokens.map((token, i) => {
    if (i === 0) return DOTENV_CLI;
    if (token === "node") return process.execPath;
    if (token === ".env.test") return path.join(BACKEND_ROOT, ".env.test");
    if (token === "dist/server.js") return SERVER_ENTRY;
    return token;
  });
}

/** Cách khởi động server: "node" chạy thẳng dist/server.js, "start:test" đi qua wrapper dotenv như npm run start:test. */
export type ServerLauncher = "node" | "start:test";

/**
 * argv (sau process.execPath) để khởi động server.
 * - "node" (mặc định): các cờ node trong args rồi tới dist/server.js, như trước đây.
 * - "start:test": trả startTestArgv(START_TEST_SCRIPT), argv suy ra từ script start:test (xem startTestArgv).
 */
function serverArgv(launcher: ServerLauncher, args: string[] | undefined): string[] {
  if (launcher === "node") return [...(args ?? []), SERVER_ENTRY];
  if (args !== undefined && args.length > 0) {
    throw new Error("launcher \"start:test\" không nhận args: script start:test không truyền cờ node nào");
  }
  return startTestArgv(START_TEST_SCRIPT);
}

/**
 * Dừng cả cây tiến trình mà helper đã spawn.
 * Trên Windows, chỉ dừng wrapper dotenv sẽ để server con mồ côi: nó vẫn giữ cổng và các pipe stdout/stderr,
 * nên sự kiện 'close' không bao giờ xảy ra. Vì vậy dùng taskkill /T /F trên PID của chính tiến trình con.
 * Nơi khác, SIGTERM tới wrapper, và wrapper tự dừng nhóm tiến trình con của nó.
 * Tiến trình đã thoát thì không làm gì: PID có thể đã thuộc về tiến trình khác (không được dừng tiến trình lạ).
 */
function killProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill();
  }
}

export interface SpawnOptions {
  env: Record<string, string>;
  /** Cờ node đặt trước dist/server.js (chỉ dùng với launcher "node") */
  args?: string[];
  timeoutMs?: number;
  /** Mặc định "node" */
  launcher?: ServerLauncher;
}

export interface SpawnResult {
  /** Mã thoát; null khi bị dừng vì quá thời gian */
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Chạy một lệnh node (process.execPath + argv) trong một thư mục tạm mới (để dotenv không nạp backend/.env),
 * gom stdout/stderr và chờ tiến trình thoát. Quá timeoutMs thì dừng tiến trình và trả code null.
 */
async function spawnNodeAndCollect(
  argv: string[],
  env: Record<string, string>,
  timeoutMs: number,
  tmpPrefix: string,
): Promise<SpawnResult> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), tmpPrefix));
  try {
    return await new Promise<SpawnResult>((resolve, reject) => {
      const started = performance.now();
      const child = spawn(process.execPath, argv, {
        cwd,
        env: buildChildEnv(env),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        killProcessTree(child);
      }, timeoutMs);
      child.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        resolve({ code: timedOut ? null : code, stdout, stderr, durationMs: performance.now() - started });
      });
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/**
 * Chạy dist/server.js đã biên dịch trong một thư mục tạm (để không nạp backend/.env)
 * và chờ tiến trình thoát. Quá timeoutMs thì dừng tiến trình và trả code null.
 */
export async function spawnServer(opts: SpawnOptions): Promise<SpawnResult> {
  return spawnNodeAndCollect(
    serverArgv(opts.launcher ?? "node", opts.args),
    opts.env,
    opts.timeoutMs ?? 15_000,
    "flashsale-boot-",
  );
}

// Loader của tsx, phân giải từ backend/node_modules (URL file://, dùng được với node --import ở mọi thư mục chạy)
const TSX_LOADER = import.meta.resolve("tsx");

/**
 * Chạy CLI TypeScript scripts/<script>.ts (giống npm run seed / npm run reset) bằng node --import tsx,
 * trong một thư mục tạm mới nên dotenv không nạp được backend/.env. args là tham số của CLI.
 * Quá timeoutMs (mặc định 15 giây) thì dừng tiến trình và trả code null.
 */
export async function spawnCli(
  script: "seed" | "reset",
  opts: { env: Record<string, string>; args?: string[]; timeoutMs?: number },
): Promise<SpawnResult> {
  const entry = path.join(BACKEND_ROOT, "scripts", `${script}.ts`);
  return spawnNodeAndCollect(
    ["--import", TSX_LOADER, entry, ...(opts.args ?? [])],
    opts.env,
    opts.timeoutMs ?? 15_000,
    "flashsale-cli-",
  );
}

export interface FakeRedis {
  port: number;
  url: string;
  close: () => Promise<void>;
}

/**
 * Server TCP giả làm một Redis hỏng trên 127.0.0.1 (cổng ngẫu nhiên), để test lỗi khởi động mà không dừng container:
 * - "reset": hủy kết nối ngay sau khi nhận
 * - "garbage": trả một dòng HTTP (không phải RESP) khi nhận dữ liệu đầu tiên
 * - "silent": nhận kết nối rồi không bao giờ trả lời
 * close() hủy mọi socket đã nhận rồi đóng server.
 */
export async function startFakeRedis(mode: "reset" | "garbage" | "silent"): Promise<FakeRedis> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {
      // Client có thể đóng kết nối bất kỳ lúc nào; lỗi socket phía server giả không quan trọng
    });
    if (mode === "reset") {
      socket.destroy();
    } else if (mode === "garbage") {
      socket.once("data", () => socket.write("HTTP/1.1 400 Bad Request\r\n\r\n"));
    }
    // "silent": nhận kết nối và không làm gì cả
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("Không đọc được cổng của Redis giả");
  const port = addr.port;
  return {
    port,
    url: `redis://127.0.0.1:${port}`,
    close: async () => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Tách stderr thành các dòng không rỗng, để test đếm đúng số dòng (bỏ dòng chỉ có khoảng trắng). */
export function stderrLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "");
}

export interface ServerProcess {
  baseUrl: string;
  stdout: () => string;
  stderr: () => string;
  stop: () => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Chạy dist/server.js (env phải có PORT) và chờ tới khi GET /api/health trả về bất kỳ phản hồi HTTP nào
 * (tối đa 20 giây). Server thoát sớm thì ném lỗi kèm stderr.
 */
export async function startServerProcess(opts: {
  env: Record<string, string>;
  args?: string[];
  launcher?: ServerLauncher;
}): Promise<ServerProcess> {
  const port = opts.env["PORT"];
  if (port === undefined) throw new Error("startServerProcess cần PORT trong env");
  const argv = serverArgv(opts.launcher ?? "node", opts.args);
  const cwd = await mkdtemp(path.join(os.tmpdir(), "flashsale-server-"));
  const child = spawn(process.execPath, argv, {
    cwd,
    env: buildChildEnv(opts.env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
  child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
  let exited = false;
  const exitedPromise = new Promise<void>((resolve) => {
    child.once("close", () => {
      exited = true;
      resolve();
    });
  });

  const stop = async (): Promise<void> => {
    if (!exited) {
      killProcessTree(child);
      await exitedPromise;
    }
    await rm(cwd, { recursive: true, force: true });
  };

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (exited) {
      await stop();
      throw new Error(`Server thoát trước khi sẵn sàng.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`Server không trả lời /api/health sau 20 giây.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      await res.arrayBuffer();
      break;
    } catch {
      await sleep(100);
    }
  }
  return { baseUrl, stdout: () => stdout, stderr: () => stderr, stop };
}

/** Chờ tới khi điều kiện đúng (ví dụ log đã ghi xong qua pipe), quá thời gian thì trả false. */
export async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) return false;
    await sleep(25);
  }
  return true;
}

/** Kết nối mongoose tới database test của file và một client Redis db riêng (đã PING). */
export async function connectTestStores(name: string, redisDb: number): Promise<{ redis: Redis }> {
  await connectMongo(testMongoUri(name), 10);
  const redis = createRedis(testRedisUrl(redisDb));
  await connectRedis(redis);
  return { redis };
}

/** Xóa database test hiện tại (chỉ khi tên bắt đầu bằng flashsale_test_), ngắt mongoose và Redis. */
export async function dropTestDatabaseAndDisconnect(redis?: Redis): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    const name = mongoose.connection.db?.databaseName ?? "";
    if (!name.startsWith(TEST_DB_PREFIX)) {
      throw new Error(`Từ chối xóa database không phải của test: "${name}"`);
    }
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
  if (redis !== undefined) await redis.quit();
}

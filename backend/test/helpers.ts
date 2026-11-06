// Bộ công cụ dùng chung cho mọi file test của backend.
//
// Quy ước cho cả phase: mỗi file test bọc toàn bộ case trong MỘT describe cấp cao nhất đặt tên
// theo tên file (không có đuôi .ts), ví dụ describe("health.test", ...). Nhờ đó báo cáo của
// node:test ghi rõ file nào đã chạy, và bước kiểm tra có thể xác nhận một file thật sự được chạy.
//
// Cách ly dữ liệu: test không bao giờ đụng vào database demo "flashsale" hay Redis db 0.
// - MongoDB: mỗi file dùng database riêng flashsale_test_<tên>_<pid> và tự xóa trong after().
// - Redis: mỗi file integration giữ một chỉ số db từ 1 đến 15.
import { spawn } from "node:child_process";
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

export interface SpawnOptions {
  env: Record<string, string>;
  args?: string[];
  timeoutMs?: number;
}

export interface SpawnResult {
  /** Mã thoát; null khi bị dừng vì quá thời gian */
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Chạy dist/server.js đã biên dịch trong một thư mục tạm (để không nạp backend/.env)
 * và chờ tiến trình thoát. Quá timeoutMs thì dừng tiến trình và trả code null.
 */
export async function spawnServer(opts: SpawnOptions): Promise<SpawnResult> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "flashsale-boot-"));
  try {
    return await new Promise<SpawnResult>((resolve, reject) => {
      const started = performance.now();
      const child = spawn(process.execPath, [...(opts.args ?? []), SERVER_ENTRY], {
        cwd,
        env: buildChildEnv(opts.env),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, opts.timeoutMs ?? 15_000);
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
export async function startServerProcess(opts: { env: Record<string, string>; args?: string[] }): Promise<ServerProcess> {
  const port = opts.env["PORT"];
  if (port === undefined) throw new Error("startServerProcess cần PORT trong env");
  const cwd = await mkdtemp(path.join(os.tmpdir(), "flashsale-server-"));
  const child = spawn(process.execPath, [...(opts.args ?? []), SERVER_ENTRY], {
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
      child.kill();
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

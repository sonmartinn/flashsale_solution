// API thật dùng riêng cho smoke/UI: không đo tải, không đọc backend/.env.
import { mkdtemp, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";

const root = fileURLToPath(new URL("../../", import.meta.url));
const originalCwd = process.cwd();
const temporary = await mkdtemp(join(tmpdir(), "flashsale-ui-"));
const lockDir = join(root, ".taste-skill");
const lockPath = join(lockDir, "ui-fixture.lock");
const databaseName = `flashsale_test_ui_${process.pid}`;
// Đã rà soát các file integration/loadtest: DB 1..12 có phân công; chỉ xét 13..15.
const reservedRedisDbs = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
let lock;
let redis;
let mongoose;
let server;
let seed;
let stopping;

async function checkPort() {
  const probe = createServer();
  await new Promise((resolveReady, reject) => {
    probe.once("error", () => reject(new Error("Cổng 5000 đang được dùng; fixture không dừng tiến trình khác.")));
    probe.listen(5000, () => resolveReady());
  });
  await new Promise(resolveClosed => probe.close(resolveClosed));
}

async function assignedRedisDbs(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", "results"].includes(entry.name)) await assignedRedisDbs(path);
    } else if (/\.(ts|mjs)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      for (const pattern of [/testRedisUrl\(\s*(\d+)\s*\)/g, /connectTestStores\([^,]+,\s*(\d+)\s*\)/g, /(?:REDIS_DB|redisDb)\s*=\s*(\d+)/g, /redis:\/\/127\.0\.0\.1:6379\/(\d+)/g]) {
        for (const match of source.matchAll(pattern)) reservedRedisDbs.add(Number(match[1]));
      }
    }
  }
}

async function cleanup() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (server?.listening) await new Promise(resolveClosed => { server.close(resolveClosed); server.closeIdleConnections(); });
    if (mongoose?.connection.readyState === 1) {
      if (mongoose.connection.db?.databaseName !== databaseName) throw new Error("Từ chối xóa MongoDB không thuộc fixture.");
      await mongoose.connection.dropDatabase();
    }
    if (redis?.status === "ready" && seed) await redis.del(`stock:${seed.saleId}`, `buyers:${seed.saleId}`);
    await mongoose?.disconnect();
    redis?.disconnect();
    if (lock) { await lock.close(); await rm(lockPath); }
    process.chdir(originalCwd);
    // Chỉ xóa thư mục mkdtemp đã tạo và kiểm tra ở đây.
    if (!resolve(temporary).startsWith(resolve(tmpdir()) + "\\") && !resolve(temporary).startsWith(resolve(tmpdir()) + "/")) throw new Error("Đường dẫn tạm không hợp lệ.");
    await rm(temporary, { recursive: true, force: true });
  })();
  return stopping;
}

try {
  await mkdir(lockDir, { recursive: true });
  lock = await open(lockPath, "wx");
  await lock.writeFile(JSON.stringify({ pid: process.pid, databaseName }));
  await checkPort();
  await assignedRedisDbs(join(root, "backend/test"));
  await assignedRedisDbs(join(root, "loadtest"));
  const emptyEnv = join(temporary, "empty.env");
  await writeFile(emptyEnv, "");
  process.chdir(temporary);
  process.env.DOTENV_CONFIG_PATH = emptyEnv;
  const requireBackend = createRequire(new URL("backend/package.json", pathToFileURL(root + "/")));
  mongoose = requireBackend("mongoose");
  const moduleAt = path => import(pathToFileURL(join(root, "backend/dist", path)).href);
  const [{ createApp }, { connectMongo }, { createRedis, connectRedis }, { loadBaseConfig }, { seedDatabase }, { FlashSale }, { registerBuyScript }] = await Promise.all([
    moduleAt("app.js"), moduleAt("config/db.js"), moduleAt("config/redis.js"), moduleAt("config/env.js"), moduleAt("services/seed.service.js"), moduleAt("models/index.js"), moduleAt("services/lua.js"),
  ]);
  let redisDb;
  for (const candidate of [15, 14, 13]) {
    if (reservedRedisDbs.has(candidate)) continue;
    const client = createRedis(`redis://127.0.0.1:6379/${candidate}`);
    try {
      await connectRedis(client);
      const ownClientId = await client.client("ID");
      const clients = await client.client("LIST");
      const otherClient = clients.split("\n").some(line => line.includes(`db=${candidate} `) && !line.startsWith(`id=${ownClientId} `));
      if (await client.dbsize() === 0 && !otherClient) { redis = client; redisDb = candidate; break; }
    } finally { if (redis !== client) client.disconnect(); }
  }
  if (!redis || redisDb === undefined) throw new Error("Không có Redis DB 13..15 trống và chưa phân công; dừng fixture.");
  registerBuyScript(redis);
  const cfg = loadBaseConfig({ PORT: "5000", MONGODB_URI: `mongodb://127.0.0.1:27018/${databaseName}`, REDIS_URL: `redis://127.0.0.1:6379/${redisDb}`, NODE_ENV: "test", MONGO_MAX_POOL_SIZE: "10", CLIENT_ORIGIN: "http://localhost:5173" });
  await connectMongo(cfg.mongoUri, cfg.mongoMaxPoolSize);
  if (mongoose.connection.db?.databaseName !== databaseName || (await mongoose.connection.db.listCollections().toArray()).length !== 0) throw new Error("MongoDB fixture không trống hoặc sai tên; dừng trước seed.");
  seed = await seedDatabase({ redis, qty: 100, mode: "v2" });
  if (process.argv.includes("--empty")) await FlashSale.updateOne({ _id: seed.saleId }, { $set: { status: "ended" } });
  const app = createApp({ cfg, redis, jwtSecret: "khoa-jwt-chi-dung-cho-ui-fixture-0123456789abcdef" });
  server = await new Promise((resolveReady, reject) => {
    const listener = app.listen(5000, error => error ? reject(error) : resolveReady(listener));
  });
  console.log(JSON.stringify({ ready: true, baseUrl: "http://localhost:5000", databaseName, redisDb, saleId: seed.saleId, empty: process.argv.includes("--empty") }));
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", data => { if (data.trim() === "stop") void cleanup().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); }); });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void cleanup().then(() => process.exit(0)); });
} catch (error) {
  console.error(`Fixture thất bại: ${error.message}`);
  await cleanup();
  process.exitCode = 1;
}

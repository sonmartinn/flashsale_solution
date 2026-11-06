// Test tích hợp cho GET /api/health và các case khởi động cần MongoDB thật.
// Cần "docker compose up -d --wait" (MongoDB 127.0.0.1:27018, Redis 127.0.0.1:6379).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import mongoose from "mongoose";
import type { Redis } from "ioredis";
import { connectMongo } from "../../src/config/db.js";
import { createRedis } from "../../src/config/redis.js";
import {
  BACKEND_ROOT,
  TEST_JWT_SECRET,
  connectTestStores,
  dropTestDatabaseAndDisconnect,
  getFreePort,
  spawnServer,
  startApp,
  startServerProcess,
  testMongoUri,
  testRedisUrl,
  waitFor,
  type ServerProcess,
  type StartedApp,
} from "../helpers.js";

// Cổng không có Redis nào lắng nghe
const DEAD_REDIS_URL = "redis://127.0.0.1:6390";

async function serverEnv(): Promise<Record<string, string>> {
  return {
    MONGODB_URI: testMongoUri("health"),
    REDIS_URL: testRedisUrl(1),
    JWT_SECRET: TEST_JWT_SECRET,
    PORT: String(await getFreePort()),
  };
}

describe("health.test", () => {
  describe("server đã biên dịch, cả hai kho dữ liệu đều chạy", () => {
    let server: ServerProcess | undefined;

    before(async () => {
      server = await startServerProcess({ env: await serverEnv() });
    });

    after(async () => {
      await server?.stop();
    });

    it("GET /api/health trả 200 với mongo, redis, nodeEnv và maxPoolSize", async () => {
      assert.ok(server);
      const res = await fetch(`${server.baseUrl}/api/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        mongo: true,
        redis: true,
        nodeEnv: "development",
        testMode: false,
        maxPoolSize: 100,
      });
    });

    it("banner in maxPoolSize và đích MongoDB, không in URI thô hay khóa JWT", async () => {
      assert.ok(server);
      const s = server;
      assert.ok(await waitFor(() => s.stdout().includes("maxPoolSize=100")), `stdout: ${s.stdout()}`);
      // NODE_ENV in trong ngoặc kép để thấy được khoảng trắng thừa
      assert.ok(s.stdout().includes('NODE_ENV="development"'), `stdout: ${s.stdout()}`);
      assert.match(s.stdout(), /127\.0\.0\.1:27018\/flashsale_test_health_/);
      assert.doesNotMatch(s.stdout(), /mongodb:\/\//);
      assert.ok(!s.stdout().includes(TEST_JWT_SECRET));
      assert.ok(!s.stderr().includes(TEST_JWT_SECRET));
    });
  });

  it("Redis không chạy lúc khởi động: thoát mã 1 và nêu Redis", async () => {
    const env = { ...(await serverEnv()), REDIS_URL: DEAD_REDIS_URL };
    const r = await spawnServer({ env, timeoutMs: 20_000 });
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /\[LỖI\].*Redis/);
    assert.match(r.stderr, /127\.0\.0\.1:6390/);
  });

  describe("app trong tiến trình: MongoDB chạy, Redis chưa kết nối", () => {
    let stores: { redis: Redis } | undefined;
    let deadRedis: Redis | undefined;
    let app: StartedApp | undefined;

    before(async () => {
      stores = await connectTestStores("health", 1);
      deadRedis = createRedis(DEAD_REDIS_URL); // không bao giờ gọi connect
      app = await startApp({ redis: deadRedis });
    });

    after(async () => {
      await app?.close();
      deadRedis?.disconnect();
      await stores?.redis.quit();
    });

    it("trả 503 { mongo: true, redis: false } trong vòng 3 giây", async () => {
      assert.ok(app);
      const started = performance.now();
      const res = await fetch(`${app.baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      const elapsed = performance.now() - started;
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), {
        mongo: true,
        redis: false,
        nodeEnv: "development",
        testMode: false,
        maxPoolSize: 100,
      });
      assert.ok(elapsed < 3000, `mất ${Math.round(elapsed)} ms`);
    });
  });

  describe("chạy với --env-file=.env.test (giống npm run start:test)", () => {
    let server: ServerProcess | undefined;

    before(async () => {
      server = await startServerProcess({
        env: await serverEnv(),
        // Đường dẫn tuyệt đối vì tiến trình con chạy trong thư mục tạm
        args: ["--env-file=" + path.join(BACKEND_ROOT, ".env.test")],
      });
    });

    after(async () => {
      await server?.stop();
    });

    it("health báo testMode true, nodeEnv test và server in cảnh báo CHẾ ĐỘ TEST", async () => {
      assert.ok(server);
      const s = server;
      const res = await fetch(`${s.baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { nodeEnv: string; testMode: boolean };
      assert.equal(body.testMode, true);
      assert.equal(body.nodeEnv, "test");
      assert.ok(
        await waitFor(() => (s.stdout() + s.stderr()).includes("CHẾ ĐỘ TEST")),
        `stdout: ${s.stdout()}\nstderr: ${s.stderr()}`,
      );
    });

    it('banner in NODE_ENV="test" và không có dòng cảnh báo NODE_ENV gần giống', async () => {
      assert.ok(server);
      const s = server;
      assert.ok(await waitFor(() => s.stdout().includes('NODE_ENV="test"')), `stdout: ${s.stdout()}`);
      assert.ok(!s.stderr().includes("[CẢNH BÁO] NODE_ENV="), `stderr: ${s.stderr()}`);
    });
  });

  describe('NODE_ENV có khoảng trắng thừa ("test "): chế độ test KHÔNG bật và health nói rõ điều đó', () => {
    let server: ServerProcess | undefined;

    before(async () => {
      // Giá trị này chính là thứ `set NODE_ENV=test && ...` của cmd.exe tạo ra
      server = await startServerProcess({ env: { ...(await serverEnv()), NODE_ENV: "test " } });
    });

    after(async () => {
      await server?.stop();
    });

    it("health trả testMode false và nodeEnv là giá trị thô \"test \" (không phải \"test\")", async () => {
      assert.ok(server);
      const res = await fetch(`${server.baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { nodeEnv: string; testMode: boolean };
      assert.equal(body.testMode, false);
      assert.equal(body.nodeEnv, "test ");
      assert.notEqual(body.nodeEnv, "test");
    });

    it('banner in NODE_ENV="test " và stderr có đúng dòng [CẢNH BÁO], không có CHẾ ĐỘ TEST', async () => {
      assert.ok(server);
      const s = server;
      assert.ok(await waitFor(() => s.stdout().includes('NODE_ENV="test "')), `stdout: ${s.stdout()}`);
      assert.ok(
        await waitFor(() => s.stderr().includes('[CẢNH BÁO] NODE_ENV="test "')),
        `stderr: ${s.stderr()}`,
      );
      assert.ok(!s.stderr().includes("CHẾ ĐỘ TEST"), `stderr: ${s.stderr()}`);
    });
  });

  after(async () => {
    // Xóa database test mà các server và app ở trên đã dùng
    if (mongoose.connection.readyState !== 1) await connectMongo(testMongoUri("health"), 10);
    await dropTestDatabaseAndDisconnect();
  });
});

// Test tích hợp cho GET /api/health: cần "docker compose up -d --wait" (MongoDB 27018, Redis 6379).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { connectMongo } from "../../src/config/db.js";
import {
  TEST_JWT_SECRET,
  dropTestDatabaseAndDisconnect,
  getFreePort,
  startServerProcess,
  testMongoUri,
  testRedisUrl,
  waitFor,
  type ServerProcess,
} from "../helpers.js";

describe("health.test", () => {
  describe("server đã biên dịch, cả hai kho dữ liệu đều chạy", () => {
    let server: ServerProcess | undefined;

    before(async () => {
      const port = await getFreePort();
      server = await startServerProcess({
        env: {
          MONGODB_URI: testMongoUri("health"),
          REDIS_URL: testRedisUrl(1),
          JWT_SECRET: TEST_JWT_SECRET,
          PORT: String(port),
        },
      });
    });

    after(async () => {
      await server?.stop();
    });

    it("GET /api/health trả 200 với mongo, redis, nodeEnv và maxPoolSize", async () => {
      assert.ok(server);
      const res = await fetch(`${server.baseUrl}/api/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { mongo: true, redis: true, nodeEnv: "development", maxPoolSize: 100 });
    });

    it("banner in maxPoolSize và đích MongoDB, không in URI thô", async () => {
      assert.ok(server);
      const s = server;
      assert.ok(await waitFor(() => s.stdout().includes("maxPoolSize=100")), `stdout: ${s.stdout()}`);
      assert.match(s.stdout(), /127\.0\.0\.1:27018\/flashsale_test_health_/);
      assert.doesNotMatch(s.stdout(), /mongodb:\/\//);
      assert.ok(!s.stdout().includes(TEST_JWT_SECRET));
      assert.ok(!s.stderr().includes(TEST_JWT_SECRET));
    });
  });

  after(async () => {
    // Xóa database test mà server đã dùng
    await connectMongo(testMongoUri("health"), 10);
    await dropTestDatabaseAndDisconnect();
  });
});

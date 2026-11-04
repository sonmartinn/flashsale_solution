// Test khởi động: chạy dist/server.js đã biên dịch trong thư mục tạm, KHÔNG cần Docker.
// Mọi URI ở đây đều không thể chạm tới dịch vụ MongoDB của Windows (cổng 27017 trên máy):
// - MongoDB "chết" dùng 127.0.0.1:27999, Redis "chết" dùng 127.0.0.1:6390
// - case cổng 27017 dùng host TEST-NET 192.0.2.1, nên kể cả khi chốt chặn hỏng cũng không chạm máy này
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { TEST_JWT_SECRET, getFreePort, spawnServer } from "./helpers.js";

const DEAD_MONGO_URI = "mongodb://127.0.0.1:27999/flashsale_boot";
const DEAD_REDIS_URL = "redis://127.0.0.1:6390";

async function baseEnv(): Promise<Record<string, string>> {
  return {
    MONGODB_URI: DEAD_MONGO_URI,
    REDIS_URL: DEAD_REDIS_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    PORT: String(await getFreePort()),
  };
}

describe("boot.test", () => {
  it("thiếu JWT_SECRET: thoát mã 1 và nêu JWT_SECRET", async () => {
    const env = await baseEnv();
    delete env["JWT_SECRET"];
    const r = await spawnServer({ env });
    assert.equal(r.code, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /\[LỖI\].*JWT_SECRET/);
    assert.ok(r.durationMs < 3000, `mất ${Math.round(r.durationMs)} ms`);
  });

  it("thiếu REDIS_URL: thoát mã 1 và nêu REDIS_URL", async () => {
    const env = await baseEnv();
    delete env["REDIS_URL"];
    const r = await spawnServer({ env });
    assert.equal(r.code, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /REDIS_URL/);
  });

  it("URI MongoDB ngầm định cổng 27017: thoát mã 1 trong 3 giây và nêu 27017", async () => {
    const env = { ...(await baseEnv()), MONGODB_URI: "mongodb://192.0.2.1/flashsale" };
    const r = await spawnServer({ env });
    assert.equal(r.code, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /27017/);
    assert.ok(r.durationMs < 3000, `mất ${Math.round(r.durationMs)} ms`);
  });

  describe("cổng đã bị chiếm trên 127.0.0.1", () => {
    let holder: net.Server | undefined;
    let heldPort = 0;

    before(async () => {
      heldPort = await getFreePort();
      holder = net.createServer();
      const h = holder;
      await new Promise<void>((resolve, reject) => {
        h.once("error", reject);
        h.listen(heldPort, "127.0.0.1", () => resolve());
      });
    });

    after(async () => {
      const h = holder;
      if (h !== undefined) await new Promise<void>((resolve) => h.close(() => resolve()));
    });

    it("thoát mã 1 trong 3 giây với thông báo cổng đang bị chiếm", async () => {
      const env = { ...(await baseEnv()), PORT: String(heldPort) };
      const r = await spawnServer({ env });
      assert.equal(r.code, 1, `stderr: ${r.stderr}`);
      assert.match(r.stderr, /đang bị chiếm/);
      assert.ok(r.durationMs < 3000, `mất ${Math.round(r.durationMs)} ms`);
    });
  });

  it("MongoDB không chạy: thoát mã 1 trong 10 giây và nêu MongoDB", async () => {
    const r = await spawnServer({ env: await baseEnv(), timeoutMs: 15_000 });
    assert.equal(r.code, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /\[LỖI\].*MongoDB/);
    assert.match(r.stderr, /127\.0\.0\.1:27999\/flashsale_boot/);
    assert.ok(r.durationMs < 10_000, `mất ${Math.round(r.durationMs)} ms`);
  });
});

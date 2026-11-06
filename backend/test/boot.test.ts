// Test khởi động: chạy dist/server.js đã biên dịch (và CLI seed/reset) trong thư mục tạm, KHÔNG cần Docker.
// Mọi URI ở đây đều không thể chạm tới dịch vụ MongoDB của Windows (cổng 27017 trên máy):
// - MongoDB "chết" dùng 127.0.0.1:27999, Redis "chết" dùng 127.0.0.1:6390
// - case cổng 27017 dùng host TEST-NET 192.0.2.1, nên kể cả khi chốt chặn hỏng cũng không chạm máy này
// Mỗi lỗi khởi động phải in ĐÚNG MỘT dòng stderr (reset in thêm dòng cảnh báo cache bắt buộc ở đầu).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { TEST_JWT_SECRET, getFreePort, spawnCli, spawnServer, stderrLines, type SpawnResult } from "./helpers.js";

const DEAD_MONGO_URI = "mongodb://127.0.0.1:27999/flashsale_boot";
const DEAD_REDIS_URL = "redis://127.0.0.1:6390";

const MONGO_DOWN_LINE = /^\[LỖI\] Không kết nối được MongoDB tại 127\.0\.0\.1:27999\/flashsale_boot/;
const RESET_WARNING_LINE = /^\[CẢNH BÁO\] Lệnh này không xóa được cache/;

async function baseEnv(): Promise<Record<string, string>> {
  return {
    MONGODB_URI: DEAD_MONGO_URI,
    REDIS_URL: DEAD_REDIS_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    PORT: String(await getFreePort()),
  };
}

/** Khẳng định server thoát mã 1, stderr (đã tách bằng stderrLines) đúng một dòng khớp `pattern` và không in banner. */
function assertSingleLineExit(r: SpawnResult, lines: string[], pattern: RegExp): void {
  assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.equal(lines.length, 1, `stderr: ${r.stderr}`);
  assert.match(lines[0] ?? "", pattern);
  assert.ok(!r.stdout.includes("API http"), `stdout: ${r.stdout}`);
}

describe("boot.test", () => {
  it("thiếu JWT_SECRET: thoát mã 1 với đúng một dòng nêu JWT_SECRET", async () => {
    const env = await baseEnv();
    delete env["JWT_SECRET"];
    const r = await spawnServer({ env });
    assertSingleLineExit(r, stderrLines(r.stderr), /^\[LỖI\] Thiếu biến môi trường JWT_SECRET/);
    assert.ok(r.durationMs < 3000, `mất ${Math.round(r.durationMs)} ms`);
  });

  it("JWT_SECRET chỉ có khoảng trắng: thoát mã 1 với đúng một dòng nêu JWT_SECRET", async () => {
    const env = { ...(await baseEnv()), JWT_SECRET: "   " };
    const r = await spawnServer({ env });
    assertSingleLineExit(r, stderrLines(r.stderr), /^\[LỖI\] Thiếu biến môi trường JWT_SECRET/);
    assert.ok(r.durationMs < 3000, `mất ${Math.round(r.durationMs)} ms`);
  });

  it("thiếu REDIS_URL: thoát mã 1 với đúng một dòng nêu REDIS_URL", async () => {
    const env = await baseEnv();
    delete env["REDIS_URL"];
    const r = await spawnServer({ env });
    assertSingleLineExit(r, stderrLines(r.stderr), /^\[LỖI\] Thiếu biến môi trường REDIS_URL/);
  });

  it("URI MongoDB ngầm định cổng 27017: thoát mã 1 trong 3 giây với đúng một dòng nêu 27017", async () => {
    const env = { ...(await baseEnv()), MONGODB_URI: "mongodb://192.0.2.1/flashsale" };
    const r = await spawnServer({ env });
    assertSingleLineExit(r, stderrLines(r.stderr), /^\[LỖI\] MONGODB_URI trỏ tới cổng 27017/);
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

    it("thoát mã 1 trong 3 giây với đúng một dòng báo cổng đang bị chiếm", async () => {
      const env = { ...(await baseEnv()), PORT: String(heldPort) };
      const r = await spawnServer({ env });
      assertSingleLineExit(r, stderrLines(r.stderr), /^\[LỖI\] Cổng \d+ đang bị chiếm/);
      assert.ok(r.durationMs < 3000, `mất ${Math.round(r.durationMs)} ms`);
    });
  });

  it("MongoDB không chạy: thoát mã 1 trong 10 giây với đúng một dòng nêu MongoDB", async () => {
    const r = await spawnServer({ env: await baseEnv(), timeoutMs: 15_000 });
    assertSingleLineExit(r, stderrLines(r.stderr), MONGO_DOWN_LINE);
    assert.ok(r.durationMs < 10_000, `mất ${Math.round(r.durationMs)} ms`);
  });

  describe("seed/reset CLI khi MongoDB không chạy", () => {
    const cliEnv = { MONGODB_URI: DEAD_MONGO_URI, REDIS_URL: DEAD_REDIS_URL };

    it("seed: thoát mã 1 với đúng một dòng [LỖI] MongoDB", async () => {
      const r = await spawnCli("seed", { env: cliEnv, timeoutMs: 20_000 });
      assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
      const lines = stderrLines(r.stderr);
      assert.equal(lines.length, 1, `stderr: ${r.stderr}`);
      assert.match(lines[0] ?? "", MONGO_DOWN_LINE);
      assert.ok(r.durationMs < 15_000, `mất ${Math.round(r.durationMs)} ms`);
    });

    it("reset: thoát mã 1, dòng cảnh báo cache rồi đúng một dòng [LỖI] MongoDB", async () => {
      const r = await spawnCli("reset", { env: cliEnv, timeoutMs: 20_000 });
      assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
      const lines = stderrLines(r.stderr);
      assert.equal(lines.length, 2, `stderr: ${r.stderr}`);
      assert.match(lines[0] ?? "", RESET_WARNING_LINE);
      assert.match(lines[1] ?? "", MONGO_DOWN_LINE);
      assert.ok(r.durationMs < 15_000, `mất ${Math.round(r.durationMs)} ms`);
    });
  });
});

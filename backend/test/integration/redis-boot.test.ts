// Test tích hợp: mọi kiểu Redis hỏng lúc khởi động phải kết thúc bằng đúng một dòng [LỖI] (G-01-2),
// cho server đã biên dịch và cả hai CLI seed/reset; còn mất kết nối SAU khi khởi động thì vẫn được ghi log.
// Cần docker compose up -d --wait; database flashsale_test_redisboot_<pid>, Redis db 5 chỉ PING.
// Redis hỏng được giả bằng cổng không có ai lắng nghe, server TCP giả và một proxy TCP:
// KHÔNG bao giờ dừng hay khởi động lại các container dùng chung.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { connectMongo } from "../../src/config/db.js";
import {
  TEST_JWT_SECRET,
  dropTestDatabaseAndDisconnect,
  getFreePort,
  spawnCli,
  spawnServer,
  startFakeRedis,
  startServerProcess,
  stderrLines,
  testMongoUri,
  waitFor,
  type FakeRedis,
  type ServerProcess,
} from "../helpers.js";

const MONGO_URI = testMongoUri("redisboot");
// Cổng không có Redis nào lắng nghe
const REFUSED_REDIS_PORT = 6390;
const RESET_WARNING_LINE = /^\[CẢNH BÁO\] Lệnh này không xóa được cache/;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function serverEnv(redisUrl: string): Promise<Record<string, string>> {
  return {
    MONGODB_URI: MONGO_URI,
    REDIS_URL: redisUrl,
    JWT_SECRET: TEST_JWT_SECRET,
    PORT: String(await getFreePort()),
  };
}

/** Dòng [LỖI] duy nhất mong đợi khi Redis tại 127.0.0.1:<port> hỏng. */
function redisFailLine(port: number): RegExp {
  return new RegExp(`^\\[LỖI\\] Không kết nối được Redis tại 127\\.0\\.0\\.1:${port}\\.`);
}

interface RedisProxy {
  port: number;
  /** Đóng listener và hủy mọi socket đang chuyển tiếp (giống Redis vừa sập). */
  cut: () => Promise<void>;
  /** Mở lại listener trên đúng cổng cũ (thử tối đa 5 lần, cách nhau 200 ms). */
  relisten: () => Promise<void>;
  close: () => Promise<void>;
}

/** Proxy TCP trong suốt trên 127.0.0.1 (cổng ngẫu nhiên) tới Redis thật 127.0.0.1:6379. */
async function startRedisProxy(): Promise<RedisProxy> {
  const sockets = new Set<net.Socket>();
  const track = (s: net.Socket): void => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
    s.on("error", () => {
      // Socket bị hủy khi cắt proxy; lỗi ở đây là chủ ý
    });
  };
  const listenOn = (port: number): Promise<net.Server> =>
    new Promise<net.Server>((resolve, reject) => {
      const srv = net.createServer((client) => {
        const upstream = net.connect(6379, "127.0.0.1");
        track(client);
        track(upstream);
        client.pipe(upstream);
        upstream.pipe(client);
        client.on("close", () => upstream.destroy());
        upstream.on("close", () => client.destroy());
      });
      srv.once("error", reject);
      srv.listen(port, "127.0.0.1", () => {
        srv.off("error", reject);
        resolve(srv);
      });
    });

  let server: net.Server | undefined = await listenOn(0);
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("Không đọc được cổng của proxy");
  const port = addr.port;

  const closeServer = async (): Promise<void> => {
    const s = server;
    server = undefined;
    for (const sock of sockets) sock.destroy();
    sockets.clear();
    if (s !== undefined) await new Promise<void>((resolve) => s.close(() => resolve()));
  };

  return {
    port,
    cut: closeServer,
    relisten: async () => {
      let lastError: unknown;
      for (let i = 0; i < 5; i++) {
        try {
          server = await listenOn(port);
          return;
        } catch (e) {
          lastError = e;
          await sleep(200);
        }
      }
      throw new Error(`Không mở lại được proxy trên cổng ${port}: ${String(lastError)}`);
    },
    close: closeServer,
  };
}

describe("redis-boot.test", () => {
  const fakes: FakeRedis[] = [];
  let server: ServerProcess | undefined;
  let proxy: RedisProxy | undefined;

  after(async () => {
    await server?.stop();
    await proxy?.close();
    for (const f of fakes) await f.close();
    // Các server đã biên dịch ở trên chạy ensureIndexes trong database test này
    await connectMongo(MONGO_URI, 10);
    await dropTestDatabaseAndDisconnect();
  });

  describe("server đã biên dịch với Redis hỏng lúc khởi động", () => {
    for (const mode of ["reset", "garbage", "silent"] as const) {
      it(`Redis giả "${mode}": thoát mã 1 với đúng một dòng [LỖI] Redis, không in banner`, async () => {
        const fake = await startFakeRedis(mode);
        fakes.push(fake);
        const r = await spawnServer({ env: await serverEnv(fake.url), timeoutMs: 25_000 });
        assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
        const lines = stderrLines(r.stderr);
        assert.equal(lines.length, 1, `stderr: ${r.stderr}`);
        assert.match(lines[0] ?? "", redisFailLine(fake.port));
        assert.ok(!r.stdout.includes("API http"), `stdout: ${r.stdout}`);
        if (mode === "silent") {
          // MongoDB + index + REDIS_STARTUP_TIMEOUT_MS (5 giây) + dư
          assert.ok(r.durationMs < 15_000, `mất ${Math.round(r.durationMs)} ms`);
        }
      });
    }
  });

  describe("CLI seed/reset với Redis hỏng (MongoDB chạy)", () => {
    const redisCases = [
      { name: "Redis từ chối kết nối", fake: false },
      { name: "Redis nhận kết nối nhưng không trả lời", fake: true },
    ];
    for (const script of ["seed", "reset"] as const) {
      for (const rc of redisCases) {
        it(`${script}, ${rc.name}: thoát mã 1 với đúng dòng [LỖI] Redis`, async () => {
          let port = REFUSED_REDIS_PORT;
          if (rc.fake) {
            const fake = await startFakeRedis("silent");
            fakes.push(fake);
            port = fake.port;
          }
          const r = await spawnCli(script, {
            env: { MONGODB_URI: MONGO_URI, REDIS_URL: `redis://127.0.0.1:${port}` },
            timeoutMs: 25_000,
          });
          assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
          const lines = stderrLines(r.stderr);
          assert.ok(!lines.some((l) => l.startsWith("[Redis]")), `stderr: ${r.stderr}`);
          if (script === "seed") {
            assert.equal(lines.length, 1, `stderr: ${r.stderr}`);
            assert.match(lines[0] ?? "", redisFailLine(port));
            assert.ok(!r.stdout.includes("Seed xong"), `stdout: ${r.stdout}`);
          } else {
            assert.equal(lines.length, 2, `stderr: ${r.stderr}`);
            assert.match(lines[0] ?? "", RESET_WARNING_LINE);
            assert.match(lines[1] ?? "", redisFailLine(port));
          }
        });
      }
    }
  });

  describe("Redis mất kết nối SAU khi khởi động (qua proxy TCP tới Redis thật)", () => {
    it("ghi đúng một dòng [Redis] mất kết nối, vẫn chạy (health 503) và tự hồi phục", { timeout: 60_000 }, async () => {
      proxy = await startRedisProxy();
      const p = proxy;
      server = await startServerProcess({ env: await serverEnv(`redis://127.0.0.1:${p.port}/5`) });
      const s = server;
      assert.ok(await waitFor(() => s.stdout().includes("API http"), 5000), `stdout: ${s.stdout()}`);
      assert.deepEqual(stderrLines(s.stderr()), [], `stderr: ${s.stderr()}`);

      // Cắt: Redis "sập" sau khi server đã chạy
      await p.cut();
      assert.ok(
        await waitFor(() => stderrLines(s.stderr()).some((l) => /^\[Redis\] mất kết nối: /.test(l)), 5000),
        `stderr: ${s.stderr()}`,
      );
      await sleep(1500);
      let lines = stderrLines(s.stderr());
      assert.equal(lines.length, 1, `stderr: ${s.stderr()}`);
      assert.match(lines[0] ?? "", /^\[Redis\] mất kết nối: /);
      assert.ok(!lines.some((l) => l.startsWith("[LỖI]")), `stderr: ${s.stderr()}`);

      // Tiến trình vẫn sống: health trả 503 với redis false
      const down = await fetch(`${s.baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      assert.equal(down.status, 503);
      const downBody = (await down.json()) as { redis: boolean };
      assert.equal(downBody.redis, false);

      // Redis "sống lại": health về 200 trong 15 giây, không thêm dòng stderr nào
      await p.relisten();
      const deadline = Date.now() + 15_000;
      let status = 0;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${s.baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
          status = res.status;
          await res.arrayBuffer();
          if (status === 200) break;
        } catch {
          // thử lại
        }
        await sleep(200);
      }
      assert.equal(status, 200, `health không về 200; stderr: ${s.stderr()}`);
      lines = stderrLines(s.stderr());
      assert.equal(lines.length, 1, `stderr: ${s.stderr()}`);
    });
  });
});

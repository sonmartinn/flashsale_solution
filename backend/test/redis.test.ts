// Test kết nối Redis lúc khởi động, KHÔNG cần Docker: Redis hỏng được giả bằng một cổng không có ai lắng nghe
// và các server TCP giả (startFakeRedis). Mọi kiểu lỗi phải làm connectRedis reject mà không in gì ra console,
// để nơi gọi (server, seed, reset) in đúng một dòng [LỖI] (G-01-2, D-19).
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Redis } from "ioredis";
import * as redisConfig from "../src/config/redis.js";
import { getFreePort, startFakeRedis, type FakeRedis } from "./helpers.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Quá thời gian này mà connectRedis(client, 1000) vẫn chưa reject thì coi là treo
const HANG_GUARD_MS = 3000;

describe("redis.test", () => {
  const fakes: FakeRedis[] = [];
  const clients: Redis[] = [];
  const realError = console.error;
  const realWarn = console.warn;

  after(async () => {
    // Dọn kể cả khi một case bị quá thời gian giữa chừng
    console.error = realError;
    console.warn = realWarn;
    for (const c of clients) c.disconnect();
    for (const f of fakes) await f.close();
  });

  /**
   * Gọi connectRedis(client, 1000) với URL hỏng, kiểm tra nó reject, ngắt client, chờ 300 ms
   * (để bắt cả lỗi phát ra trễ) rồi khẳng định console.error và console.warn không nhận dòng nào.
   * Trả về thời gian tới lúc reject (ms).
   */
  async function expectSilentRejection(url: string): Promise<number> {
    const errors: string[] = [];
    const warns: string[] = [];
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(" "));
    };
    console.warn = (...a: unknown[]) => {
      warns.push(a.map(String).join(" "));
    };
    let elapsed = 0;
    try {
      const client = redisConfig.createRedis(url);
      clients.push(client);
      const started = performance.now();
      // Chặn trường hợp connectRedis treo: sau HANG_GUARD_MS thì coi như "không reject" để test báo lỗi rõ ràng
      const outcome = Promise.race([redisConfig.connectRedis(client, 1000), sleep(HANG_GUARD_MS).then(() => "treo")]);
      await assert.rejects(outcome, Error, `connectRedis không reject trong ${HANG_GUARD_MS} ms (treo)`);
      elapsed = performance.now() - started;
      client.disconnect();
      await sleep(300);
    } finally {
      console.error = realError;
      console.warn = realWarn;
    }
    assert.deepEqual(errors, [], `console.error nhận: ${errors.join(" | ")}`);
    assert.deepEqual(warns, [], `console.warn nhận: ${warns.join(" | ")}`);
    return elapsed;
  }

  it("REDIS_STARTUP_TIMEOUT_MS là 5000 ms (D-19)", () => {
    assert.equal(redisConfig.REDIS_STARTUP_TIMEOUT_MS, 5000);
  });

  it("cổng không có ai lắng nghe (ECONNREFUSED): reject và không in gì", { timeout: 10_000 }, async () => {
    const port = await getFreePort();
    await expectSilentRejection(`redis://127.0.0.1:${port}`);
  });

  it("server hủy kết nối ngay sau khi nhận: reject và không in gì", { timeout: 10_000 }, async () => {
    const fake = await startFakeRedis("reset");
    fakes.push(fake);
    await expectSilentRejection(fake.url);
  });

  it("server trả dữ liệu không phải RESP (dòng HTTP): reject và không in gì", { timeout: 10_000 }, async () => {
    const fake = await startFakeRedis("garbage");
    fakes.push(fake);
    await expectSilentRejection(fake.url);
  });

  it("server nhận kết nối nhưng không bao giờ trả lời: reject trong hạn khởi động và không in gì", { timeout: 10_000 }, async () => {
    const fake = await startFakeRedis("silent");
    fakes.push(fake);
    const elapsed = await expectSilentRejection(fake.url);
    assert.ok(elapsed < 2500, `mất ${Math.round(elapsed)} ms`);
  });
});

// Smoke test script Lua mua hàng (BUY-09, D-33) trên Redis 7.4 thật qua ioredis 6 (RESP3).
// Cần "docker compose up -d --wait". Dùng Redis db 6 (không bao giờ db 0); database flashsale_test_lua_<pid>
// không được dùng nhưng connectTestStores là helper chung nên vẫn mở rồi xóa.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../../src/config/redis.js";
import { registerBuyScript, runBuyScript } from "../../src/services/lua.js";
import { connectTestStores, dropTestDatabaseAndDisconnect } from "../helpers.js";

describe("lua.test", () => {
  let redis: Redis;

  before(async () => {
    ({ redis } = await connectTestStores("lua", 6));
    registerBuyScript(redis);
  });

  after(async () => {
    await redis.flushdb();
    await dropTestDatabaseAndDisconnect(redis);
  });

  it("client đã thương lượng RESP3 (options.protocol = 3)", () => {
    const options = redis.options as unknown as { protocol?: unknown };
    assert.equal(options.protocol, 3);
  });

  it("bốn mã trả về: -2 chưa nạp kho, 1 thành công, -1 đã mua, 0 hết hàng", async () => {
    const saleId = "lua-bon-ma";
    assert.equal(await runBuyScript(redis, saleId, "user-a", 1), -2);

    await redis.set(stockKey(saleId), "1");
    assert.equal(await runBuyScript(redis, saleId, "user-a", 1), 1);
    assert.equal(await runBuyScript(redis, saleId, "user-a", 1), -1);
    assert.equal(await runBuyScript(redis, saleId, "user-b", 1), 0);
    assert.equal(await redis.get(stockKey(saleId)), "0");
    assert.deepEqual(await redis.smembers(buyersKey(saleId)), ["user-a"]);
  });

  it("1.000 lời gọi song song với 1.000 user trên kho 100: đúng 100 lần 1, kho \"0\", SCARD 100", async () => {
    const saleId = "lua-1000";
    await redis.set(stockKey(saleId), "100");
    await redis.del(buyersKey(saleId));

    const pending = Array.from({ length: 1000 }, (_, i) => runBuyScript(redis, saleId, `user-${i}`, 1));
    const codes = await Promise.all(pending);

    assert.equal(codes.filter((c) => c === 1).length, 100);
    assert.equal(codes.filter((c) => c === 0).length, 900);
    assert.equal(await redis.get(stockKey(saleId)), "0");
    assert.equal(await redis.scard(buyersKey(saleId)), 100);
  });

  it("gọi registerBuyScript hai lần không sao", async () => {
    registerBuyScript(redis);
    const saleId = "lua-dang-ky-lai";
    await redis.set(stockKey(saleId), "2");
    assert.equal(await runBuyScript(redis, saleId, "user-a", 1), 1);
    assert.equal(await redis.get(stockKey(saleId)), "1");
  });
});

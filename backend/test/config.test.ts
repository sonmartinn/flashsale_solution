// Test đơn vị cho config/env.ts: chỉ gọi hàm thuần, không kết nối gì
// (vì vậy được phép chứa URI cổng 27017 trên loopback).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadBaseConfig, loadJwtSecret, parseMongoUri, parseRedisUrl } from "../src/config/env.js";

const VALID_ENV = {
  MONGODB_URI: "mongodb://127.0.0.1:27018/flashsale",
  REDIS_URL: "redis://127.0.0.1:6379",
};

function assertConfigError(fn: () => unknown, ...fragments: string[]): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ConfigError, `phải là ConfigError, nhận ${String(err)}`);
    for (const f of fragments) assert.ok(err.message.includes(f), `thông báo "${err.message}" thiếu "${f}"`);
    return true;
  });
}

describe("config.test", () => {
  describe("parseMongoUri", () => {
    it("từ chối cổng 27017 ngầm định và chỉ sang 27018", () => {
      assertConfigError(() => parseMongoUri("mongodb://localhost/flashsale"), "27017", "27018");
    });

    it("từ chối cổng 27017 ghi tường minh", () => {
      assertConfigError(() => parseMongoUri("mongodb://127.0.0.1:27017/flashsale"), "27017");
    });

    it("từ chối URI không có tên database", () => {
      assertConfigError(() => parseMongoUri("mongodb://127.0.0.1:27018"));
    });

    it("từ chối giao thức mongodb+srv", () => {
      assertConfigError(() => parseMongoUri("mongodb+srv://x/y"));
    });

    it("từ chối URI nhiều host", () => {
      assertConfigError(() => parseMongoUri("mongodb://a:27018,b:27019/x"));
    });

    it("trả host:port/db và bỏ thông tin đăng nhập", () => {
      assert.equal(parseMongoUri("mongodb://u:p@127.0.0.1:27018/flashsale"), "127.0.0.1:27018/flashsale");
    });
  });

  describe("parseRedisUrl", () => {
    it("trả host:port khi db là 0", () => {
      assert.equal(parseRedisUrl("redis://127.0.0.1:6379"), "127.0.0.1:6379");
    });

    it("thêm /db khi db khác 0", () => {
      assert.equal(parseRedisUrl("redis://127.0.0.1:6379/1"), "127.0.0.1:6379/1");
    });

    it("dùng cổng 6379 khi không ghi cổng", () => {
      assert.equal(parseRedisUrl("redis://127.0.0.1"), "127.0.0.1:6379");
    });

    it("từ chối giao thức khác redis:// và chỉ số db không phải số", () => {
      assertConfigError(() => parseRedisUrl("http://127.0.0.1:6379"));
      assertConfigError(() => parseRedisUrl("redis://127.0.0.1:6379/abc"));
    });
  });

  describe("loadBaseConfig", () => {
    it("thiếu MONGODB_URI thì báo tên biến", () => {
      assertConfigError(() => loadBaseConfig({}), "MONGODB_URI");
    });

    it("MONGODB_URI chỉ có khoảng trắng cũng bị coi là thiếu", () => {
      assertConfigError(() => loadBaseConfig({ ...VALID_ENV, MONGODB_URI: "   " }), "MONGODB_URI");
    });

    it("thiếu REDIS_URL thì báo tên biến", () => {
      assertConfigError(() => loadBaseConfig({ MONGODB_URI: VALID_ENV.MONGODB_URI }), "REDIS_URL");
    });

    it("MONGO_MAX_POOL_SIZE phải là số nguyên dương", () => {
      assertConfigError(() => loadBaseConfig({ ...VALID_ENV, MONGO_MAX_POOL_SIZE: "abc" }), "MONGO_MAX_POOL_SIZE");
      assertConfigError(() => loadBaseConfig({ ...VALID_ENV, MONGO_MAX_POOL_SIZE: "0" }), "MONGO_MAX_POOL_SIZE");
    });

    it("PORT ngoài khoảng 1-65535 bị từ chối", () => {
      assertConfigError(() => loadBaseConfig({ ...VALID_ENV, PORT: "70000" }), "PORT");
      assertConfigError(() => loadBaseConfig({ ...VALID_ENV, PORT: "5000abc" }), "PORT");
    });

    it("giá trị mặc định khi chỉ có hai biến bắt buộc", () => {
      const cfg = loadBaseConfig({ ...VALID_ENV });
      assert.equal(cfg.port, 5000);
      assert.equal(cfg.clientOrigin, "http://localhost:5173");
      assert.equal(cfg.mongoMaxPoolSize, 100);
      assert.equal(cfg.nodeEnv, "development");
      assert.equal(cfg.isTestMode, false);
      assert.equal(cfg.mongoTarget, "127.0.0.1:27018/flashsale");
      assert.equal(cfg.redisTarget, "127.0.0.1:6379");
    });

    it("đọc PORT và MONGO_MAX_POOL_SIZE tường minh", () => {
      const cfg = loadBaseConfig({ ...VALID_ENV, PORT: "5001", MONGO_MAX_POOL_SIZE: "50" });
      assert.equal(cfg.port, 5001);
      assert.equal(cfg.mongoMaxPoolSize, 50);
    });

    it("NODE_ENV=test bật chế độ test, TEST (chữ hoa) thì không", () => {
      assert.equal(loadBaseConfig({ ...VALID_ENV, NODE_ENV: "test" }).isTestMode, true);
      assert.equal(loadBaseConfig({ ...VALID_ENV, NODE_ENV: "TEST" }).isTestMode, false);
    });

    it("không cần JWT_SECRET (seed/reset dùng được)", () => {
      assert.doesNotThrow(() => loadBaseConfig({ ...VALID_ENV }));
    });
  });

  describe("loadJwtSecret", () => {
    it("thiếu JWT_SECRET thì báo tên biến", () => {
      assertConfigError(() => loadJwtSecret({}), "JWT_SECRET");
      assertConfigError(() => loadJwtSecret({ JWT_SECRET: "  " }), "JWT_SECRET");
    });

    it("trả về đúng giá trị khóa", () => {
      assert.equal(loadJwtSecret({ JWT_SECRET: "abc" }), "abc");
    });
  });
});

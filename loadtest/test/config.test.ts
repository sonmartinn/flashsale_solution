// Test đơn vị cho cấu hình dòng lệnh của E1 và E3 (D-03, D-17, D-19). Hàm thuần, env được truyền vào.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError,
  E1_DEFAULTS,
  E1_USAGE,
  E3_REQUESTS,
  E3_STOCK,
  E3_USAGE,
  parseE1Args,
  parseE3Args,
} from "../lib/config.js";

const SALE = "65a1b2c3d4e5f60718293a4b";

describe("config.test", () => {
  describe("parseE1Args", () => {
    it("không có tham số và env rỗng: dùng giá trị mặc định", () => {
      assert.deepEqual(parseE1Args([], {}), {
        baseUrl: "http://127.0.0.1:5000",
        saleId: null,
        runs: 5,
        users: 1000,
        stock: 100,
        adminEmail: "admin@flashsale.local",
        adminPassword: "matkhau123",
        nonDefault: false,
      });
    });

    it("E1_DEFAULTS là 5 lượt, 1000 user, tồn kho 100", () => {
      assert.deepEqual(E1_DEFAULTS, { runs: 5, users: 1000, stock: 100 });
    });

    it("dùng env LOADTEST_* khi không có cờ", () => {
      const cfg = parseE1Args([], {
        LOADTEST_BASE_URL: "http://localhost:5001/",
        LOADTEST_ADMIN_EMAIL: "boss@example.com",
        LOADTEST_ADMIN_PASSWORD: "bimat-456",
      });
      assert.equal(cfg.baseUrl, "http://localhost:5001");
      assert.equal(cfg.adminEmail, "boss@example.com");
      assert.equal(cfg.adminPassword, "bimat-456");
    });

    it("env rỗng hoặc chỉ có khoảng trắng: quay về mặc định", () => {
      const cfg = parseE1Args([], { LOADTEST_BASE_URL: "", LOADTEST_ADMIN_EMAIL: "  ", LOADTEST_ADMIN_PASSWORD: "" });
      assert.equal(cfg.baseUrl, "http://127.0.0.1:5000");
      assert.equal(cfg.adminEmail, "admin@flashsale.local");
      assert.equal(cfg.adminPassword, "matkhau123");
    });

    it("cờ --base-url thắng env", () => {
      const cfg = parseE1Args(["--base-url", "https://example.com:8443/api"], { LOADTEST_BASE_URL: "http://localhost:5001" });
      assert.equal(cfg.baseUrl, "https://example.com:8443");
    });

    it("--sale chữ hoa được chuyển về chữ thường", () => {
      assert.equal(parseE1Args(["--sale", SALE.toUpperCase()], {}).saleId, SALE);
      assert.equal(parseE1Args([`--sale=${SALE}`], {}).saleId, SALE);
    });

    it("nhận --runs, --users, --stock và đánh dấu nonDefault", () => {
      const cfg = parseE1Args(["--runs", "1", "--users", "200", "--stock=10"], {});
      assert.equal(cfg.runs, 1);
      assert.equal(cfg.users, 200);
      assert.equal(cfg.stock, 10);
      assert.equal(cfg.nonDefault, true);
    });

    it("truyền đúng giá trị mặc định thì nonDefault vẫn là false", () => {
      assert.equal(parseE1Args(["--runs", "5", "--users", "1000", "--stock", "100"], {}).nonDefault, false);
    });

    it("chỉ đổi một trong ba giá trị cũng là nonDefault", () => {
      assert.equal(parseE1Args(["--runs", "2"], {}).nonDefault, true);
      assert.equal(parseE1Args(["--users", "999"], {}).nonDefault, true);
      assert.equal(parseE1Args(["--stock", "50"], {}).nonDefault, true);
    });

    for (const bad of ["ftp://x", "abc", "", "file:///etc/passwd"]) {
      it(`từ chối --base-url "${bad}"`, () => {
        assert.throws(() => parseE1Args([`--base-url=${bad}`], {}), ConfigError);
      });
    }

    it("từ chối env LOADTEST_BASE_URL không phải http(s)", () => {
      assert.throws(() => parseE1Args([], { LOADTEST_BASE_URL: "ftp://x" }), ConfigError);
    });

    for (const bad of ["abc", "", SALE.slice(1), `${SALE}0`, "zz".repeat(12)]) {
      it(`từ chối --sale "${bad}"`, () => {
        assert.throws(() => parseE1Args([`--sale=${bad}`], {}), ConfigError);
      });
    }

    for (const bad of ["0", "-1", "1.5", "abc", "", "007", "101"]) {
      it(`từ chối --runs "${bad}"`, () => {
        assert.throws(() => parseE1Args([`--runs=${bad}`], {}), ConfigError);
      });
    }

    it("từ chối --runs -1 dạng tách rời", () => {
      assert.throws(() => parseE1Args(["--runs", "-1"], {}), ConfigError);
    });

    for (const bad of ["0", "1", "1.5", "abc", "", "0100", "100001"]) {
      it(`từ chối --users "${bad}"`, () => {
        assert.throws(() => parseE1Args([`--users=${bad}`, "--stock=1"], {}), ConfigError);
      });
    }

    for (const bad of ["0", "-5", "abc", "", "010", "1000001"]) {
      it(`từ chối --stock "${bad}"`, () => {
        assert.throws(() => parseE1Args([`--stock=${bad}`], {}), ConfigError);
      });
    }

    it("từ chối --users 100 --stock 100 (số user phải lớn hơn tồn kho)", () => {
      assert.throws(() => parseE1Args(["--users", "100", "--stock", "100"], {}), (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /--users/);
        return true;
      });
    });

    it("từ chối --stock lớn hơn số user mặc định", () => {
      assert.throws(() => parseE1Args(["--stock", "1000"], {}), ConfigError);
    });

    it("nhận --users 101 --stock 100", () => {
      const cfg = parseE1Args(["--users", "101", "--stock", "100"], {});
      assert.equal(cfg.users, 101);
    });

    it("từ chối cờ lạ --bogus", () => {
      assert.throws(() => parseE1Args(["--bogus"], {}), ConfigError);
    });

    it("từ chối tham số vị trí", () => {
      assert.throws(() => parseE1Args(["v1"], {}), ConfigError);
    });

    it("thông báo lỗi không bao giờ chứa mật khẩu admin", () => {
      const env = { LOADTEST_ADMIN_PASSWORD: "mat-khau-bi-mat-xyz" };
      for (const argv of [["--runs", "0"], ["--bogus"], ["--users", "5", "--stock", "9"], ["--base-url", "ftp://x"]]) {
        assert.throws(
          () => parseE1Args(argv, env),
          (err: unknown) => err instanceof ConfigError && !err.message.includes("mat-khau-bi-mat-xyz"),
        );
      }
    });

    it("dòng cách dùng E1 là tiếng Việt và nhắc đủ cờ", () => {
      assert.match(E1_USAGE, /^Cách dùng: npm run e1 -- /);
      for (const flag of ["--runs", "--users", "--stock", "--sale", "--base-url"]) assert.ok(E1_USAGE.includes(flag));
    });
  });

  describe("parseE3Args", () => {
    it("không có tham số: mặc định 5 lượt, không có --sale", () => {
      assert.deepEqual(parseE3Args([], {}), {
        baseUrl: "http://127.0.0.1:5000",
        saleId: null,
        runs: 5,
        adminEmail: "admin@flashsale.local",
        adminPassword: "matkhau123",
      });
    });

    it("E3 cố định tồn kho 100 và 10 request", () => {
      assert.equal(E3_STOCK, 100);
      assert.equal(E3_REQUESTS, 10);
    });

    it("nhận --runs, --sale và --base-url", () => {
      const cfg = parseE3Args(["--runs", "2", "--sale", SALE, "--base-url", "http://127.0.0.1:5002"], {});
      assert.equal(cfg.runs, 2);
      assert.equal(cfg.saleId, SALE);
      assert.equal(cfg.baseUrl, "http://127.0.0.1:5002");
    });

    for (const flag of ["--users", "--stock"]) {
      it(`từ chối ${flag} (E3 cố định 10 request và tồn kho 100)`, () => {
        assert.throws(() => parseE3Args([flag, "10"], {}), ConfigError);
      });
    }

    it("từ chối --runs 0", () => {
      assert.throws(() => parseE3Args(["--runs", "0"], {}), ConfigError);
    });

    it("dòng cách dùng E3 nhắc đúng lệnh", () => {
      assert.match(E3_USAGE, /^Cách dùng: npm run e3 -- /);
    });
  });
});

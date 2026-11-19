// Test đơn vị cho cấu hình dòng lệnh của E1 và E3 (D-03, D-17, D-19). Hàm thuần, env được truyền vào.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError,
  E1_DEFAULTS,
  E1_USAGE,
  E2_DEFAULTS,
  E2_USAGE,
  E2_WARMUP,
  E3_REQUESTS,
  E3_STOCK,
  E3_USAGE,
  E4_DEFAULTS,
  parseE4Args,
  parseE1Args,
  parseE2Args,
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

  describe("parseE2Args", () => {
    it("không có tham số: 5 lượt, S = M = 5000, connection 100,300,500, không smoke", () => {
      assert.deepEqual(parseE2Args([], {}), {
        baseUrl: "http://127.0.0.1:5000",
        saleId: null,
        runs: 5,
        adminEmail: "admin@flashsale.local",
        adminPassword: "matkhau123",
        stock: 5000,
        soldoutRequests: 5000,
        connections: [100, 300, 500],
        smoke: false,
      });
    });

    it("hằng số mặc định và cỡ khởi động", () => {
      assert.deepEqual(E2_DEFAULTS, { runs: 5, stock: 5000, soldoutRequests: 5000, connections: [100, 300, 500] });
      assert.equal(E2_WARMUP, 1000);
    });

    it("--stock 999 bị từ chối khi không có --smoke", () => {
      assert.throws(() => parseE2Args(["--stock", "999"], {}), ConfigError);
    });

    it("--stock 999 được nhận khi có --smoke", () => {
      const cfg = parseE2Args(["--smoke", "--stock", "999"], {});
      assert.equal(cfg.stock, 999);
      assert.equal(cfg.smoke, true);
    });

    it("--connections 100 bị từ chối khi không có --smoke", () => {
      assert.throws(() => parseE2Args(["--connections", "100"], {}), ConfigError);
    });

    it("--connections bằng đúng danh sách mặc định được nhận khi không có --smoke", () => {
      assert.deepEqual(parseE2Args(["--connections", "100,300,500"], {}).connections, [100, 300, 500]);
    });

    it("--runs 1 bị từ chối khi không có --smoke", () => {
      assert.throws(() => parseE2Args(["--runs", "1"], {}), ConfigError);
    });

    it("--runs 7 và --stock 6000 được nhận khi không có --smoke", () => {
      const cfg = parseE2Args(["--runs", "7", "--stock", "6000"], {});
      assert.equal(cfg.runs, 7);
      assert.equal(cfg.stock, 6000);
    });

    it("--smoke --stock 50 --connections 100 bị từ chối (số request nhỏ hơn số connection)", () => {
      assert.throws(() => parseE2Args(["--smoke", "--stock", "50", "--connections", "100"], {}), ConfigError);
    });

    it("--smoke --soldout-requests 50 --connections 100 bị từ chối", () => {
      assert.throws(
        () => parseE2Args(["--smoke", "--soldout-requests", "50", "--connections", "100"], {}),
        ConfigError,
      );
    });

    it("--stock 400 với mức 500 connection mặc định bị từ chối kể cả khi smoke", () => {
      assert.throws(() => parseE2Args(["--smoke", "--stock", "400"], {}), ConfigError);
    });

    for (const bad of ["100,abc", "0", "", "100,", "1001", "100,100"]) {
      it(`--connections "${bad}" bị từ chối`, () => {
        assert.throws(() => parseE2Args(["--smoke", "--connections", bad], {}), ConfigError);
      });
    }

    it("--smoke --runs 2 --stock 1000 --soldout-requests 1000 --connections 100,500 được nhận", () => {
      const cfg = parseE2Args(
        ["--smoke", "--runs", "2", "--stock", "1000", "--soldout-requests", "1000", "--connections", "100,500"],
        {},
      );
      assert.equal(cfg.runs, 2);
      assert.equal(cfg.stock, 1000);
      assert.equal(cfg.soldoutRequests, 1000);
      assert.deepEqual(cfg.connections, [100, 500]);
      assert.equal(cfg.smoke, true);
    });

    it("từ chối --smoke=giatri và cờ lạ", () => {
      assert.throws(() => parseE2Args(["--smoke=yes"], {}), ConfigError);
      assert.throws(() => parseE2Args(["--users", "10"], {}), ConfigError);
    });

    it("dòng cách dùng E2 nhắc đúng lệnh", () => {
      assert.match(E2_USAGE, /^Cách dùng: npm run e2 -- /);
    });
  });

  describe("parseE4Args", () => {
    it("không có tham số: dùng 1 lượt, tồn kho 1000 và 50 worker", () => {
      assert.deepEqual(parseE4Args([], {}), {
        baseUrl: "http://127.0.0.1:5000",
        saleId: null,
        runs: 1,
        stock: 1000,
        concurrency: 50,
        adminEmail: "admin@flashsale.local",
        adminPassword: "matkhau123",
      });
      assert.deepEqual(E4_DEFAULTS, { runs: 1, stock: 1000, concurrency: 50 });
    });

    for (const argv of [
      ["--stock", "9"],
      ["--concurrency", "0"],
      ["--concurrency", "501"],
      ["--bogus"],
    ]) {
      it(`từ chối ${argv.join(" ")}`, () => {
        assert.throws(() => parseE4Args(argv, {}), ConfigError);
      });
    }
  });
});

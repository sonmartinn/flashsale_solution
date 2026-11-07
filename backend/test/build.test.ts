// Kiểm tra kết quả build (script "test" chạy build trước): tsc không chép file .lua nên bước build phải tự chép.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BACKEND_ROOT, DOTENV_CLI, START_TEST_SCRIPT, startTestArgv } from "./helpers.js";

const dist = path.join(BACKEND_ROOT, "dist");

// Bảng thay thế mong đợi, giữ riêng trong test (không lấy từ helpers) để kiểm tra độc lập phép ánh xạ.
const EXPECTED_REPLACEMENTS: Record<string, string> = {
  dotenv: DOTENV_CLI,
  node: process.execPath,
  ".env.test": path.join(BACKEND_ROOT, ".env.test"),
  "dist/server.js": path.join(BACKEND_ROOT, "dist", "server.js"),
};

describe("build.test", () => {
  it("có dist/server.js", () => {
    assert.ok(existsSync(path.join(dist, "server.js")));
  });

  it("có dist/lua/buy.lua với nội dung giống src/lua/buy.lua", () => {
    const built = path.join(dist, "lua", "buy.lua");
    assert.ok(existsSync(built));
    assert.equal(readFileSync(built, "utf8"), readFileSync(path.join(BACKEND_ROOT, "src", "lua", "buy.lua"), "utf8"));
  });

  it("không có dist/src (rootDir đặt tường minh)", () => {
    assert.ok(!existsSync(path.join(dist, "src")));
  });

  it("script start:test nạp .env.test bằng dotenv run --override (G-01-9) và khớp với helper", () => {
    const pkg = JSON.parse(readFileSync(path.join(BACKEND_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.equal(pkg.scripts["start:test"], START_TEST_SCRIPT);
    // CLI dotenv đi kèm gói dotenv đã có sẵn (không thêm gói mới)
    assert.ok(existsSync(DOTENV_CLI), DOTENV_CLI);
  });

  it("startTestArgv(START_TEST_SCRIPT) giữ mọi token của script theo đúng thứ tự (WR-02)", () => {
    const segments = START_TEST_SCRIPT.split("&&");
    const tokens = (segments[segments.length - 1] ?? "").trim().split(/\s+/);
    const argv = startTestArgv(START_TEST_SCRIPT);
    assert.equal(argv.length, tokens.length, `argv: ${JSON.stringify(argv)}`);
    tokens.forEach((token, i) => {
      const expected = Object.hasOwn(EXPECTED_REPLACEMENTS, token) ? EXPECTED_REPLACEMENTS[token] : token;
      assert.equal(argv[i], expected, `token thứ ${i} ("${token}")`);
      // Mọi cờ (token bắt đầu bằng "-") phải xuất hiện nguyên văn ở đúng vị trí của nó
      if (token.startsWith("-")) assert.equal(argv[i], token);
    });
  });

  it("startTestArgv đi theo script được đưa vào: bỏ -q và --override thì argv cũng không còn (WR-02)", () => {
    // Chuỗi viết sẵn, không suy ra từ START_TEST_SCRIPT, nên case vẫn đúng khi hằng đổi
    const argv = startTestArgv("npm run build && dotenv run -f .env.test -- node dist/server.js");
    assert.deepEqual(argv, [
      DOTENV_CLI,
      "run",
      "-f",
      path.join(BACKEND_ROOT, ".env.test"),
      "--",
      process.execPath,
      path.join(BACKEND_ROOT, "dist", "server.js"),
    ]);
  });

  it("startTestArgv từ chối script mà helper không phát lại trung thực (WR-02)", () => {
    const envFileFlag = ["--env", "file"].join("-");
    const rejected = [
      // Bước chạy trước không phải npm run build
      "npm run lint && dotenv run -q --override -f .env.test -- node dist/server.js",
      // Dạng trước G-01-9: launcher là node với cờ nạp file env của Node, không phải dotenv
      `npm run build && node ${envFileFlag}=.env.test dist/server.js`,
      // Token có dấu nháy: tách theo khoảng trắng không phát lại được cách shell bỏ nháy
      'npm run build && dotenv run -f ".env.test" -- node dist/server.js',
      // Không chạy dist/server.js
      "npm run build && dotenv run -q --override -f .env.test -- node dist/other.js",
    ];
    for (const script of rejected) {
      assert.throws(() => startTestArgv(script), Error, script);
    }
  });
});

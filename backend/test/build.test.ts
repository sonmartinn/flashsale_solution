// Kiểm tra kết quả build (script "test" chạy build trước): tsc không chép file .lua nên bước build phải tự chép.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BACKEND_ROOT } from "./helpers.js";

const dist = path.join(BACKEND_ROOT, "dist");

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
});

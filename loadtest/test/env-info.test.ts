// Test đơn vị cho thông tin môi trường ghi vào CSV (D-11, RESEARCH Pitfall 9).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ENV_COLUMNS } from "../lib/csv.js";
import { collectEnvInfo, envColumns, newSessionId, readGitCommit, type GitRunner } from "../lib/env-info.js";

/** Git giả: trả kết quả theo lệnh con (rev-parse / status) và ghi lại các tham số đã nhận. */
function fakeGit(
  revParse: { status: number | null; stdout: string } | null,
  porcelain: { status: number | null; stdout: string } | null,
  calls: string[][] = [],
): GitRunner {
  return (args) => {
    calls.push(args);
    return args[0] === "rev-parse" ? revParse : porcelain;
  };
}

describe("env-info.test", () => {
  it("mã phiên có dạng 20261109T103000Z-ab12 và không có dấu hai chấm", () => {
    const id = newSessionId();
    assert.match(id, /^\d{8}T\d{6}Z-[0-9a-f]{4}$/);
    assert.equal(id.includes(":"), false);
  });

  it("mã phiên dùng mốc giờ UTC và chuỗi ngẫu nhiên truyền vào", () => {
    assert.equal(newSessionId(new Date("2026-11-09T10:30:00.123Z"), "ab12"), "20261109T103000Z-ab12");
  });

  it("commit sạch: chỉ có sha ngắn", () => {
    const calls: string[][] = [];
    assert.equal(readGitCommit(fakeGit({ status: 0, stdout: "abc1234\n" }, { status: 0, stdout: "" }, calls)), "abc1234");
    assert.deepEqual(calls[1], [
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      "backend",
      "loadtest",
      ":(exclude)loadtest/results",
    ]);
  });

  it("có thay đổi chưa commit: thêm -dirty", () => {
    const git = fakeGit({ status: 0, stdout: "abc1234\n" }, { status: 0, stdout: " M backend/src/app.ts\n" });
    assert.equal(readGitCommit(git), "abc1234-dirty");
  });

  it("không chạy được git: chuỗi rỗng", () => {
    assert.equal(readGitCommit(fakeGit(null, null)), "");
  });

  it("rev-parse thất bại: chuỗi rỗng", () => {
    assert.equal(readGitCommit(fakeGit({ status: 1, stdout: "" }, { status: 0, stdout: "" })), "");
  });

  it("rev-parse trả chuỗi rỗng: chuỗi rỗng", () => {
    assert.equal(readGitCommit(fakeGit({ status: 0, stdout: "\n" }, { status: 0, stdout: "" })), "");
  });

  it("git thật trả sha ngắn (có thể kèm -dirty) hoặc chuỗi rỗng", () => {
    assert.match(readGitCommit(), /^([0-9a-f]{7,}(-dirty)?)?$/);
  });

  it("collectEnvInfo và envColumns điền đủ chín cột môi trường", () => {
    const info = collectEnvInfo({
      session: "20261109T103000Z-ab12",
      maxPoolSize: 100,
      git: fakeGit({ status: 0, stdout: "abc1234\n" }, { status: 0, stdout: "" }),
    });
    assert.equal(info.gitCommit, "abc1234");
    assert.equal(info.nodeVersion, process.version);
    assert.ok(info.cpuCount >= 1);
    assert.ok(info.totalMemGB > 0);
    const row = envColumns(info, new Date("2026-11-09T10:30:00.000Z"));
    assert.deepEqual(Object.keys(row), [...ENV_COLUMNS]);
    assert.equal(row["date"], "2026-11-09T10:30:00.000Z");
    assert.equal(row["maxPoolSize"], 100);
  });
});

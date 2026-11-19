// Thông tin môi trường ghi vào đầu mọi dòng CSV (D-11): phiên đo, commit, Node, hệ điều hành, CPU, RAM
// và maxPoolSize của server. Nhờ đó mỗi con số trong báo cáo truy ngược được về máy và mã đã đo.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { availableParallelism, cpus, platform, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import type { CsvValue } from "./csv.js";

/** Thư mục gốc của repo (loadtest/lib/ -> ../../). fileURLToPath vì đường dẫn có dấu cách và tiếng Việt. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface EnvInfo {
  session: string;
  gitCommit: string;
  nodeVersion: string;
  os: string;
  cpuModel: string;
  cpuCount: number;
  totalMemGB: number;
  maxPoolSize: number | null;
}

/**
 * Mã phiên đo dạng `20261109T103000Z-ab12`: mốc giờ UTC gọn cộng 4 hex ngẫu nhiên.
 * Không có dấu hai chấm, nên dùng được trong tên file trên Windows (RESEARCH Anti-Patterns).
 */
export function newSessionId(now: Date = new Date(), rand: string = randomBytes(2).toString("hex")): string {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll("-", "").replaceAll(":", "");
  return `${stamp}-${rand}`;
}

/** Chạy git với mảng tham số; trả về null khi không chạy được git (chưa cài, không phải repo...). */
export type GitRunner = (args: string[]) => { status: number | null; stdout: string } | null;

/** Gọi git trực tiếp, không qua shell, cwd là gốc repo: không có đường dẫn nào nằm trong chuỗi lệnh. */
const defaultGitRunner: GitRunner = (args) => {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true });
  if (result.error !== undefined) return null;
  return { status: result.status, stdout: result.stdout };
};

/**
 * Commit ngắn của HEAD, thêm `-dirty` khi backend/ hoặc loadtest/ có thay đổi chưa commit trên file đã
 * theo dõi. Bỏ qua loadtest/results: CSV của chính phiên đo trước không được làm phiên sau thành dirty
 * (RESEARCH Pitfall 9). Trả về chuỗi rỗng khi không đọc được git.
 */
export function readGitCommit(run: GitRunner = defaultGitRunner): string {
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head === null || head.status !== 0) return "";
  const sha = head.stdout.trim();
  if (sha.length === 0) return "";
  const status = run([
    "status",
    "--porcelain",
    "--untracked-files=no",
    "--",
    "backend",
    "loadtest",
    ":(exclude)loadtest/results",
  ]);
  // Không biết trạng thái cây làm việc thì vẫn ghi commit, không tự gắn -dirty
  if (status === null || status.status !== 0) return sha;
  return status.stdout.trim().length > 0 ? `${sha}-dirty` : sha;
}

/** Thu thập thông tin môi trường một lần ở đầu phiên đo. */
export function collectEnvInfo(opts: { session: string; maxPoolSize: number | null; git?: GitRunner }): EnvInfo {
  return {
    session: opts.session,
    gitCommit: readGitCommit(opts.git),
    nodeVersion: process.version,
    os: `${platform()} ${release()}`,
    cpuModel: cpus()[0]?.model.trim() ?? "",
    cpuCount: availableParallelism(),
    // formatCell làm tròn 2 chữ số thập phân khi ghi
    totalMemGB: totalmem() / 1024 ** 3,
    maxPoolSize: opts.maxPoolSize,
  };
}

/** Chín cột môi trường cho một dòng CSV; `date` là thời điểm ghi dòng (ISO-8601 UTC). */
export function envColumns(info: EnvInfo, date: Date = new Date()): Record<string, CsvValue> {
  return {
    session: info.session,
    date: date.toISOString(),
    gitCommit: info.gitCommit,
    nodeVersion: info.nodeVersion,
    os: info.os,
    cpuModel: info.cpuModel,
    cpuCount: info.cpuCount,
    totalMemGB: info.totalMemGB,
    maxPoolSize: info.maxPoolSize,
  };
}

// Gọi CLI đối soát của backend (backend/scripts/reconcile.ts) cho đợt sale V2 sau mỗi lượt (D-10).
//
// Chạy process.execPath với mảng tham số, KHÔNG qua shell (T-03-10): đường dẫn dự án có dấu cách và
// tiếng Việt, và không có chuỗi lệnh nào để chèn. cwd là backend/ để dotenv nạp backend/.env, tức đúng
// MONGODB_URI/REDIS_URL mà server đang dùng (RESEARCH Pattern 3).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReconcileOutcome } from "./types.js";

/** Thư mục backend/ (fileURLToPath, không dùng URL.pathname vì đường dẫn có dấu cách và tiếng Việt). */
export const BACKEND_DIR = fileURLToPath(new URL("../../backend/", import.meta.url));

/** Loader của tsx (URL file://), phân giải từ loadtest/node_modules, dùng được với node --import ở mọi cwd. */
export const TSX_LOADER = import.meta.resolve("tsx");

const RECONCILE_ENTRY = path.join(BACKEND_DIR, "scripts", "reconcile.ts");

/**
 * Chạy reconcile cho một đợt sale và gom stdout + stderr (utf8). Không bao giờ từ chối: lỗi khởi chạy
 * hoặc quá thời gian đều trả code null để classifyReconcile xếp vào "invalid".
 */
export function runReconcile(
  saleId: string,
  opts: { fix?: boolean; timeoutMs?: number } = {},
): Promise<{ code: number | null; out: string }> {
  const args = ["--import", TSX_LOADER, RECONCILE_ENTRY, "--sale", saleId, ...(opts.fix === true ? ["--fix"] : [])];
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out });
    };
    const child = spawn(process.execPath, args, {
      cwd: BACKEND_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.setEncoding("utf8").on("data", (d: string) => {
      out += d;
    });
    child.stderr.setEncoding("utf8").on("data", (d: string) => {
      out += d;
    });
    const timer = setTimeout(() => {
      out += "\n[harness] reconcile quá thời gian, đã dừng tiến trình";
      child.kill();
      finish(null);
    }, opts.timeoutMs ?? 30_000);
    child.once("error", (err) => {
      out += `\n[harness] không chạy được reconcile: ${err.message}`;
      finish(null);
    });
    child.once("close", (code) => finish(code));
  });
}

/**
 * Phân loại kết quả đối soát. Mã 0 chỉ là "clean" khi có dòng "(v2): KHỚP": reconcile cũng thoát 0 khi bỏ
 * qua một đợt sale không phải v2 (RESEARCH Pitfall 6), trường hợp đó không chứng minh được gì nên là invalid.
 */
export function classifyReconcile(code: number | null, out: string): ReconcileOutcome {
  if (code === 0 && out.includes("(v2): KHỚP")) return "clean";
  if (code === 2) return "drift";
  return "invalid";
}

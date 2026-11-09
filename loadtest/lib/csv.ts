// Ghi file CSV kết quả thí nghiệm (D-11, D-12).
//
// Định dạng cố định để Phase 5 (biểu đồ, phân tích) đọc lại được trên mọi máy:
// - dấu phẩy phân cách, dấu chấm thập phân, không bao giờ định dạng số theo locale;
// - UTF-8 không BOM, xuống dòng LF, một dòng tiêu đề;
// - chỉ bọc ngoặc kép khi ô chứa dấu phẩy, ngoặc kép, CR hoặc LF.
// Mỗi lần chạy `npm run eN` ghi đè file và thêm từng dòng ngay khi một lượt chạy xong,
// nên nếu tiến trình chết giữa chừng thì các dòng đã ghi vẫn còn trên đĩa.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CsvValue = string | number | boolean | null | undefined;

/** Thư mục loadtest/results/ (dùng fileURLToPath vì đường dẫn dự án có dấu cách và tiếng Việt). */
export const RESULTS_DIR = fileURLToPath(new URL("../results/", import.meta.url));

/** Cột môi trường có mặt ở đầu mọi dòng của mọi file eN.csv (D-11). */
export const ENV_COLUMNS = [
  "session",
  "date",
  "gitCommit",
  "nodeVersion",
  "os",
  "cpuModel",
  "cpuCount",
  "totalMemGB",
  "maxPoolSize",
] as const;

/** Cột của e1.csv, đã đóng băng (D-18). Đổi cột là phải sửa cả phân tích ở Phase 5. */
export const E1_COLUMNS = [
  ...ENV_COLUMNS,
  "run",
  "mode",
  "users",
  "totalQty",
  "s201",
  "s409SoldOut",
  "s409AlreadyBought",
  "s401",
  "sOther4xx",
  "s5xx",
  "connErrors",
  "orders",
  "distinctUsers",
  "finalStock",
  "oversold",
  "reconcile",
  "durationMs",
  "status",
  "note",
] as const;

/** Cột của e3.csv, đã đóng băng (D-20). */
export const E3_COLUMNS = [
  ...ENV_COLUMNS,
  "run",
  "mode",
  "requests",
  "totalQty",
  "s201",
  "s409SoldOut",
  "s409AlreadyBought",
  "sOther",
  "realErrors",
  "userOrders",
  "finalStock",
  "expectedStock",
  "stockLeak",
  "reconcile",
  "status",
  "note",
] as const;

/**
 * Cột của e2.csv, đã đóng băng (D-26): một dòng cho mỗi (lượt x pha), phase là in_stock hoặc sold_out.
 * Biểu đồ WEB-08 và phân tích DOC-02 ở Phase 5 đọc đúng các cột này.
 */
export const E2_COLUMNS = [
  ...ENV_COLUMNS,
  "connections",
  "mode",
  "run",
  "phase",
  "requests",
  "totalQty",
  "durationMs",
  "rps",
  "p50Ms",
  "p95Ms",
  "p99Ms",
  "meanMs",
  "maxMs",
  "s201",
  "s409SoldOut",
  "s409AlreadyBought",
  "s5xx",
  "connErrors",
  "timeouts",
  "realErrors",
  "status",
  "note",
] as const;

/** Ký tự đầu khiến bảng tính hiểu ô là công thức (chặn CSV formula injection). */
const FORMULA_START = new Set(["=", "+", "-", "@"]);
const NEEDS_QUOTES = /[",\r\n]/;

/** Định dạng một ô CSV. */
export function formatCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // Số nguyên giữ nguyên (kể cả số âm, ví dụ finalStock -50 của V0); số thực làm tròn 2 chữ số
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  let text = value;
  if (text.length > 0 && FORMULA_START.has(text[0] as string)) text = `'${text}`;
  if (NEEDS_QUOTES.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

/**
 * Ghép một dòng theo đúng thứ tự cột. Ném lỗi khi dòng có khóa lạ hoặc thiếu khóa:
 * schema đã đóng băng, nên một lỗi chính tả phải làm hỏng ngay chứ không âm thầm ra ô trống.
 */
export function formatRow(columns: readonly string[], row: Record<string, CsvValue>): string {
  const known = new Set(columns);
  for (const key of Object.keys(row)) {
    if (!known.has(key)) throw new Error(`Dòng CSV có cột lạ "${key}"`);
  }
  const cells: string[] = [];
  for (const column of columns) {
    if (!Object.hasOwn(row, column)) throw new Error(`Dòng CSV thiếu cột "${column}"`);
    cells.push(formatCell(row[column]));
  }
  return cells.join(",");
}

export interface CsvWriter {
  readonly path: string;
  /** Ghi thêm một dòng xuống đĩa ngay lập tức. */
  append(row: Record<string, CsvValue>): void;
}

/** Tạo (ghi đè) file CSV với dòng tiêu đề, rồi trả về bộ ghi thêm từng dòng. */
export function createCsvWriter(filePath: string, columns: readonly string[]): CsvWriter {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${columns.join(",")}\n`, "utf8");
  return {
    path: filePath,
    append(row: Record<string, CsvValue>): void {
      appendFileSync(filePath, `${formatRow(columns, row)}\n`, "utf8");
    },
  };
}

/** Đường dẫn tuyệt đối của một file trong loadtest/results/. */
export function resultPath(name: string): string {
  return path.join(RESULTS_DIR, name);
}

/** Ghi dữ liệu thô dạng JSON vào loadtest/results/raw/ (git bỏ qua) và trả về đường dẫn file. */
export function writeRawJson(fileName: string, data: unknown): string {
  // Chỉ nhận tên file trần, không cho phép thư mục con hay ".." thoát khỏi results/raw/
  if (fileName.length === 0 || path.basename(fileName) !== fileName || fileName === "." || fileName === "..") {
    throw new Error(`Tên file dữ liệu thô không hợp lệ: "${fileName}"`);
  }
  const dir = path.join(RESULTS_DIR, "raw");
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return filePath;
}

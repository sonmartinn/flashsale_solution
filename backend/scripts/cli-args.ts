// Phân tích tham số dòng lệnh cho seed, reset và reconcile. Hàm thuần: không I/O, không kết nối database,
// nên tham số sai bị từ chối TRƯỚC khi chạm vào dữ liệu.
import { parseArgs } from "node:util";
import { SALE_MODES, type SaleMode } from "../src/models/flash-sale.js";
import { normalizeObjectId } from "../src/utils/object-id.js";

/** Tham số dòng lệnh không hợp lệ: CLI in thông báo này kèm dòng cách dùng rồi thoát mã 1. */
export class CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliArgsError";
  }
}

export const SEED_USAGE = "Cách dùng: npm run seed -- [--qty <n>] [--mode v0|v1|v2]";
export const RESET_USAGE = "Cách dùng: npm run reset -- [--sale <saleId>] [--mode v0|v1|v2]";

/** Giới hạn trên của --qty: số nguyên an toàn, dư sức cho E2 (cần ít nhất 1000). */
const MAX_QTY = 1_000_000;

export interface SeedArgs {
  qty: number;
  mode: SaleMode;
}

export interface ResetArgs {
  saleId?: string;
  mode?: SaleMode;
}

type OptionSpec = Record<string, { type: "string"; default?: string }>;

/**
 * Gọi parseArgs ở chế độ strict (từ chối cờ lạ và tham số vị trí).
 * parseArgs ném lỗi tiếng Anh, nên bọc lại thành CliArgsError tiếng Việt.
 * Đây là CLI, không phải handler Express, nên try/catch cục bộ là hợp lệ.
 */
function parseStrict(argv: string[], options: OptionSpec): Record<string, string | undefined> {
  try {
    const { values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false });
    const out: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(values)) {
      out[key] = typeof value === "string" ? value : undefined;
    }
    return out;
  } catch (err) {
    throw new CliArgsError(`Tham số không hợp lệ: ${(err as Error).message}`);
  }
}

function parseQty(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > MAX_QTY) {
    throw new CliArgsError(`--qty phải là số nguyên dương từ 1 đến ${MAX_QTY}, nhận "${raw}"`);
  }
  return Number(raw);
}

function parseMode(raw: string): SaleMode {
  const mode = SALE_MODES.find((m) => m === raw);
  if (mode === undefined) {
    throw new CliArgsError(`--mode phải là v0, v1 hoặc v2, nhận "${raw}"`);
  }
  return mode;
}

/** Tham số của npm run seed: mặc định --qty 100, --mode v2 (D-06). */
export function parseSeedArgs(argv: string[]): SeedArgs {
  const values = parseStrict(argv, {
    qty: { type: "string", default: "100" },
    mode: { type: "string", default: "v2" },
  });
  return { qty: parseQty(values["qty"] ?? "100"), mode: parseMode(values["mode"] ?? "v2") };
}

/** Tham số của npm run reset: chỉ trả về những khóa đã được truyền (D-07). */
export function parseResetArgs(argv: string[]): ResetArgs {
  const values = parseStrict(argv, {
    sale: { type: "string" },
    mode: { type: "string" },
  });
  const out: ResetArgs = {};
  const rawSale = values["sale"];
  if (rawSale !== undefined) {
    const saleId = normalizeObjectId(rawSale);
    if (saleId === null) {
      throw new CliArgsError(`--sale phải là ObjectId 24 ký tự hex, nhận "${rawSale}"`);
    }
    out.saleId = saleId;
  }
  const rawMode = values["mode"];
  if (rawMode !== undefined) out.mode = parseMode(rawMode);
  return out;
}

export const RECONCILE_USAGE =
  "Cách dùng: npm run reconcile -- [--sale <saleId>] [--fix]  (chỉ chạy khi không có lượt mua nào đang diễn ra)";

export interface ReconcileArgs {
  saleId?: string;
  fix: boolean;
}

/**
 * Tham số của npm run reconcile (D-26). Gọi parseArgs trực tiếp thay vì parseStrict để seed/reset giữ nguyên
 * cách phân tích (RESEARCH Pitfall 9). Strict mode từ chối cờ lạ và tham số vị trí.
 */
export function parseReconcileArgs(argv: string[]): ReconcileArgs {
  let rawSale: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv,
      options: { sale: { type: "string" } },
      strict: true,
      allowPositionals: false,
    });
    rawSale = values.sale;
  } catch (err) {
    throw new CliArgsError(`Tham số không hợp lệ: ${(err as Error).message}`);
  }
  const out: ReconcileArgs = { fix: false };
  if (rawSale !== undefined) {
    const saleId = normalizeObjectId(rawSale);
    if (saleId === null) {
      throw new CliArgsError(`--sale phải là ObjectId 24 ký tự hex, nhận "${rawSale}"`);
    }
    out.saleId = saleId;
  }
  return out;
}

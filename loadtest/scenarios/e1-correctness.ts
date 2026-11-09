// npm run e1 -- [--runs n] [--users n] [--stock n] [--sale id] [--base-url url]
// E1 (chống bán quá): mỗi lượt reset đợt sale về tồn kho `stock`, rồi `users` user KHÁC NHAU cùng bấm mua một lúc.
// Chạy xen kẽ v0, v1, v2 trong từng lượt (D-17). PASS khi mọi lượt V0 bán quá, mọi lượt V1/V2 đúng `stock` đơn
// và V2 đối soát khớp. Mỗi lượt ghi một dòng vào loadtest/results/e1.csv ngay khi xong (D-18).
// Cần backend chạy `npm run start:test` ở terminal khác (D-02). Mã thoát: 0 PASS, 1 FAIL, 2 INVALID.
import { realErrors, type ResponseCounts } from "../lib/classify.js";
import { E1_USAGE, parseE1Args, type E1Config } from "../lib/config.js";
import { E1_COLUMNS, type CsvValue } from "../lib/csv.js";
import { envColumns } from "../lib/env-info.js";
import { burst } from "../lib/http.js";
import { countDistinct } from "../lib/ids.js";
import { classifyReconcile, runReconcile } from "../lib/reconcile.js";
import { closeSession, openSession, runExperiment, type Session } from "../lib/session.js";
import {
  InvalidError,
  SALE_MODES,
  type ReconcileOutcome,
  type RunStatus,
  type SaleMode,
  type StatsSnapshot,
} from "../lib/types.js";
import { combineRuns, judgeE1Run } from "../lib/verdict.js";

/** Kết quả một lượt, giữ lại để in bảng tổng hợp cuối phiên. */
interface RunRecord {
  run: number;
  mode: SaleMode;
  status: RunStatus;
  orders: number | null;
  oversold: number | null;
  reasons: string[];
}

/** Những gì đo được trong một lượt; null khi lượt dừng trước bước đó. */
interface Measured {
  counts: ResponseCounts | null;
  stats: StatsSnapshot | null;
  reconcile: ReconcileOutcome;
  reconcileCode: number | null;
  durationMs: number | null;
}

/** Một dòng e1.csv theo đúng schema đã đóng băng (D-18). */
function e1Row(
  s: Session,
  cfg: E1Config,
  run: number,
  mode: SaleMode,
  m: Measured,
  status: RunStatus,
  reasons: string[],
): Record<string, CsvValue> {
  const c = m.counts;
  const st = m.stats;
  const notes: string[] = [];
  if (cfg.nonDefault) notes.push("cấu hình không mặc định");
  notes.push(...reasons);
  // D-18 chỉ có ba giá trị clean | drift | n/a; mã thoát lạ của reconcile được ghi vào note
  if (m.reconcile === "invalid") notes.push(`reconcile mã ${m.reconcileCode ?? "null"}`);
  return {
    ...envColumns(s.env),
    run,
    mode,
    users: cfg.users,
    totalQty: cfg.stock,
    s201: c?.s201 ?? null,
    s409SoldOut: c?.s409SoldOut ?? null,
    s409AlreadyBought: c?.s409AlreadyBought ?? null,
    s401: c?.s401 ?? null,
    sOther4xx: c?.sOther4xx ?? null,
    s5xx: c?.s5xx ?? null,
    connErrors: c === null ? null : c.connErrors + c.timeouts,
    orders: st?.orders ?? null,
    distinctUsers: st?.distinctUsers ?? null,
    finalStock: st === null ? null : mode === "v2" ? st.redisStock : st.mongoRemaining,
    oversold: st?.oversold ?? null,
    reconcile: m.reconcile === "invalid" ? "n/a" : m.reconcile,
    durationMs: m.durationMs === null ? null : Math.round(m.durationMs),
    status,
    note: notes.join("; "),
  };
}

/**
 * Một lượt của một mode: reset có kiểm tra, bắn tải, đọc stats, đối soát (v2), phán quyết, ghi dòng CSV.
 * Lỗi INVALID ở bất kỳ bước nào vẫn ghi dòng của lượt trước khi trả về, để phiên dừng lại (D-15).
 */
async function runOnce(s: Session, cfg: E1Config, run: number, mode: SaleMode): Promise<RunRecord> {
  const m: Measured = { counts: null, stats: null, reconcile: "n/a", reconcileCode: null, durationMs: null };
  let status: RunStatus;
  let reasons: string[];
  try {
    await s.resetAndCheck(mode, cfg.stock);
    const ids = s.ids.nextBlock(cfg.users);
    const b = await burst({ baseUrl: s.cfg.baseUrl, saleId: s.saleId, mode, userIds: ids });
    m.counts = b.counts;
    m.durationMs = b.durationMs;
    m.stats = await s.admin.stats(s.saleId);
    if (mode === "v2") {
      const rec = await runReconcile(s.saleId);
      m.reconcileCode = rec.code;
      m.reconcile = classifyReconcile(rec.code, rec.out);
    }
    const judgement = judgeE1Run({
      mode,
      users: cfg.users,
      distinctIds: countDistinct(ids),
      counts: b.counts,
      stats: m.stats,
      reconcile: m.reconcile,
    });
    status = judgement.status;
    reasons = judgement.reasons;
  } catch (err) {
    if (!(err instanceof InvalidError)) throw err;
    status = "INVALID";
    reasons = [err.message];
  }

  s.csv.append(e1Row(s, cfg, run, mode, m, status, reasons));

  const c = m.counts;
  const parts =
    c === null
      ? ["không bắn tải"]
      : [
          `201=${c.s201}`,
          `409 hết hàng=${c.s409SoldOut}`,
          `409 đã mua=${c.s409AlreadyBought}`,
          `lỗi thật=${realErrors(c)}`,
          `đơn=${m.stats?.orders ?? "?"}`,
          `bán quá=${m.stats?.oversold ?? "?"}`,
          `${Math.round(m.durationMs ?? 0)} ms`,
        ];
  if (mode === "v2" && m.stats !== null) parts.push(`đối soát=${m.reconcile}`);
  console.log(
    `Lượt ${run} ${mode}: ${parts.join(", ")} -> ${status}${reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}`,
  );

  return { run, mode, status, orders: m.stats?.orders ?? null, oversold: m.stats?.oversold ?? null, reasons };
}

/** "min-max" của các giá trị đã đo, hoặc "-" khi không có. */
function range(values: (number | null)[]): string {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return "-";
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? String(lo) : `${lo}-${hi}`;
}

/** Bảng tổng hợp theo mode (D-16). */
function printTable(records: RunRecord[], cfg: E1Config): void {
  console.log("");
  console.log(`Tổng hợp E1 (${cfg.users} user, tồn kho ${cfg.stock}, ${cfg.runs} lượt dự kiến mỗi mode):`);
  const header = ["mode", "lượt", "PASS", "FAIL", "INVALID", "đơn (min-max)", "bán quá (min-max)"];
  const rows = SALE_MODES.map((mode) => {
    const rs = records.filter((r) => r.mode === mode);
    return [
      mode,
      String(rs.length),
      String(rs.filter((r) => r.status === "PASS").length),
      String(rs.filter((r) => r.status === "FAIL").length),
      String(rs.filter((r) => r.status === "INVALID").length),
      range(rs.map((r) => r.orders)),
      range(rs.map((r) => r.oversold)),
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] as string).length)));
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) => cell.padEnd(widths[i] as number))
      .join("  ")
      .trimEnd();
  console.log(line(header));
  for (const r of rows) console.log(line(r));
  console.log("");
}

/** Lý do ngắn cho dòng KẾT LUẬN. */
function verdictReason(verdict: RunStatus, records: RunRecord[], cfg: E1Config): string {
  if (verdict === "INVALID") {
    const bad = records.find((r) => r.status === "INVALID");
    return bad === undefined
      ? "không có lượt nào chạy xong"
      : `dừng ở lượt ${bad.run} ${bad.mode}: ${bad.reasons.join("; ")}`;
  }
  if (verdict === "FAIL") {
    const failed = records.filter((r) => r.status === "FAIL");
    const shown = failed.slice(0, 3).map((r) => `lượt ${r.run} ${r.mode} (${r.reasons.join("; ")})`);
    return `${failed.length} lượt FAIL: ${shown.join(", ")}${failed.length > 3 ? ", ..." : ""}`;
  }
  const v0Runs = records.filter((r) => r.mode === "v0").length;
  return `V0 bán quá ở cả ${v0Runs} lượt; V1 và V2 luôn đúng ${cfg.stock} đơn, V2 đối soát khớp`;
}

await runExperiment("e1", E1_USAGE, async () => {
  const cfg = parseE1Args(process.argv.slice(2), process.env);
  const s = await openSession("e1", cfg, E1_COLUMNS);
  const records: RunRecord[] = [];
  try {
    runs: for (let run = 1; run <= cfg.runs; run++) {
      for (const mode of SALE_MODES) {
        const record = await runOnce(s, cfg, run, mode);
        records.push(record);
        // INVALID dừng cả phiên (D-15); FAIL thì chạy tiếp, không thử lại (D-14)
        if (record.status === "INVALID") break runs;
      }
    }
  } finally {
    await closeSession(s);
  }
  const verdict = combineRuns(records.map((r) => r.status));
  printTable(records, cfg);
  console.log(`KẾT LUẬN E1: ${verdict} — ${verdictReason(verdict, records, cfg)}`);
  return verdict;
});

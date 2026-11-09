// npm run e3 -- [--runs n] [--sale id] [--base-url url]
// E3 (1 đơn/người): mỗi lượt reset tồn kho 100, rồi MỘT user mới gửi 10 request mua cùng lúc. Chạy xen kẽ v1, v2
// (V0 không có bù kho theo thiết kế nên không đo ở đây). PASS khi mọi lượt có đúng một 201, chín 409, một đơn
// và tồn kho giảm đúng 1 (không rò rỉ); V2 còn phải đối soát khớp (D-19, D-20).
// Mỗi lượt ghi một dòng vào loadtest/results/e3.csv ngay khi xong. Cần backend chạy `npm run start:test` (D-02).
// Mã thoát: 0 PASS, 1 FAIL, 2 INVALID.
import type { ResponseCounts } from "../lib/classify.js";
import { E3_REQUESTS, E3_STOCK, E3_USAGE, parseE3Args, type E3Config } from "../lib/config.js";
import { E3_COLUMNS, type CsvValue } from "../lib/csv.js";
import { envColumns } from "../lib/env-info.js";
import { burst } from "../lib/http.js";
import { countDistinct } from "../lib/ids.js";
import { waitForPortBudget } from "../lib/ports.js";
import { classifyReconcile, runReconcile } from "../lib/reconcile.js";
import { closeSession, openSession, runExperiment, type Session } from "../lib/session.js";
import { InvalidError, type ReconcileOutcome, type RunStatus, type StatsSnapshot } from "../lib/types.js";
import { combineRuns, judgeE3Run, type E3Judgement } from "../lib/verdict.js";

/** V0 bị loại khỏi E3: không có bù kho nên rò rỉ là hành vi đã biết (Phase 2 D-09). */
const E3_MODES = ["v1", "v2"] as const;
type E3Mode = (typeof E3_MODES)[number];

interface RunRecord {
  run: number;
  mode: E3Mode;
  status: RunStatus;
  s201: number | null;
  finalStock: number | null;
  reasons: string[];
}

/** Những gì đo được trong một lượt; null khi lượt dừng trước bước đó. */
interface Measured {
  waitedMs: number;
  timeWait: number | null;
  statsBefore: StatsSnapshot | null;
  counts: ResponseCounts | null;
  codes: Record<string, number> | null;
  stats: StatsSnapshot | null;
  reconcile: ReconcileOutcome;
  reconcileCode: number | null;
  reconcileOut: string;
  durationMs: number | null;
  judgement: E3Judgement | null;
}

/** Một dòng e3.csv theo đúng schema đã đóng băng (D-20). */
function e3Row(
  s: Session,
  run: number,
  mode: E3Mode,
  m: Measured,
  status: RunStatus,
  reasons: string[],
): Record<string, CsvValue> {
  const c = m.counts;
  const j = m.judgement;
  const notes: string[] = [];
  if (m.waitedMs > 0) notes.push(`chờ cổng ${Math.round(m.waitedMs / 1000)} s`);
  notes.push(...reasons);
  if (m.reconcile === "invalid") notes.push(`reconcile mã ${m.reconcileCode ?? "null"}`);
  return {
    ...envColumns(s.env),
    run,
    mode,
    requests: E3_REQUESTS,
    totalQty: E3_STOCK,
    s201: c?.s201 ?? null,
    s409SoldOut: c?.s409SoldOut ?? null,
    s409AlreadyBought: c?.s409AlreadyBought ?? null,
    sOther: j?.sOther ?? null,
    realErrors: j?.realErrors ?? null,
    userOrders: m.stats?.orders ?? null,
    finalStock: j?.finalStock ?? null,
    expectedStock: j?.expectedStock ?? null,
    stockLeak: j?.stockLeak ?? null,
    reconcile: m.reconcile === "invalid" ? "n/a" : m.reconcile,
    status,
    note: notes.join("; "),
  };
}

/**
 * Một lượt: canh cổng, reset có kiểm tra, một user mới bắn 10 request cùng lúc, đọc stats, đối soát (v2),
 * phán quyết, ghi dòng CSV và JSON thô. INVALID ở bất kỳ bước nào vẫn ghi dòng trước khi phiên dừng (D-15).
 */
async function runOnce(s: Session, run: number, mode: E3Mode): Promise<RunRecord> {
  const m: Measured = {
    waitedMs: 0,
    timeWait: null,
    statsBefore: null,
    counts: null,
    codes: null,
    stats: null,
    reconcile: "n/a",
    reconcileCode: null,
    reconcileOut: "",
    durationMs: null,
    judgement: null,
  };
  let status: RunStatus;
  let reasons: string[];
  try {
    const guard = await waitForPortBudget({ port: s.port, planned: E3_REQUESTS });
    m.waitedMs = guard.waitedMs;
    m.timeWait = guard.skipped ? null : guard.timeWait;
    m.statsBefore = await s.resetAndCheck(mode, E3_STOCK);
    // Một id mới cho cả 10 request: cùng một người bấm mua 10 lần cùng lúc
    const userId = s.ids.nextBlock(1)[0] as string;
    const userIds = new Array<string>(E3_REQUESTS).fill(userId);
    const b = await burst({ baseUrl: s.cfg.baseUrl, saleId: s.saleId, mode, userIds });
    m.counts = b.counts;
    m.codes = b.codes;
    m.durationMs = b.durationMs;
    m.stats = await s.admin.stats(s.saleId);
    if (mode === "v2") {
      const rec = await runReconcile(s.saleId);
      m.reconcileCode = rec.code;
      m.reconcileOut = rec.out;
      m.reconcile = classifyReconcile(rec.code, rec.out);
    }
    m.judgement = judgeE3Run({
      mode,
      requests: E3_REQUESTS,
      distinctIds: countDistinct(userIds),
      counts: b.counts,
      stats: m.stats,
      reconcile: m.reconcile,
    });
    status = m.judgement.status;
    reasons = m.judgement.reasons;
  } catch (err) {
    if (!(err instanceof InvalidError)) throw err;
    status = "INVALID";
    reasons = [err.message];
  }

  s.csv.append(e3Row(s, run, mode, m, status, reasons));
  s.raw(`run${run}-${mode}`, {
    run,
    mode,
    requests: E3_REQUESTS,
    totalQty: E3_STOCK,
    waitedMs: Math.round(m.waitedMs),
    timeWait: m.timeWait,
    statsBefore: m.statsBefore,
    statsAfter: m.stats,
    counts: m.counts,
    codes: m.codes,
    durationMs: m.durationMs,
    reconcile: { outcome: m.reconcile, code: m.reconcileCode, out: m.reconcileOut },
    judgement: m.judgement ?? { status, reasons },
  });

  const c = m.counts;
  const j = m.judgement;
  const parts =
    c === null || j === null
      ? ["không bắn tải"]
      : [
          `201=${c.s201}`,
          `409 đã mua=${c.s409AlreadyBought}`,
          `409 hết hàng=${c.s409SoldOut}`,
          `lỗi thật=${j.realErrors}`,
          `đơn=${m.stats?.orders ?? "?"}`,
          `tồn kho ${j.finalStock ?? "null"}/${j.expectedStock}`,
        ];
  if (mode === "v2" && m.stats !== null) parts.push(`đối soát=${m.reconcile}`);
  console.log(
    `Lượt ${run} ${mode}: ${parts.join(", ")} -> ${status}${reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}`,
  );

  return { run, mode, status, s201: c?.s201 ?? null, finalStock: j?.finalStock ?? null, reasons };
}

function range(values: (number | null)[]): string {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return "-";
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? String(lo) : `${lo}-${hi}`;
}

/** Bảng tổng hợp theo mode. */
function printTable(records: RunRecord[], cfg: E3Config): void {
  console.log("");
  console.log(`Tổng hợp E3 (1 user x ${E3_REQUESTS} request, tồn kho ${E3_STOCK}, ${cfg.runs} lượt dự kiến mỗi mode):`);
  const header = ["mode", "lượt", "PASS", "FAIL", "INVALID", "201 (min-max)", "tồn kho cuối (min-max)"];
  const rows = E3_MODES.map((mode) => {
    const rs = records.filter((r) => r.mode === mode);
    return [
      mode,
      String(rs.length),
      String(rs.filter((r) => r.status === "PASS").length),
      String(rs.filter((r) => r.status === "FAIL").length),
      String(rs.filter((r) => r.status === "INVALID").length),
      range(rs.map((r) => r.s201)),
      range(rs.map((r) => r.finalStock)),
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

function verdictReason(verdict: RunStatus, records: RunRecord[]): string {
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
  return (
    `V1 và V2: mỗi lượt đúng 1 đơn cho ${E3_REQUESTS} request đồng thời của cùng một user, ` +
    `tồn kho giảm đúng 1, không rò rỉ; V2 đối soát khớp`
  );
}

await runExperiment("e3", E3_USAGE, async () => {
  const cfg = parseE3Args(process.argv.slice(2), process.env);
  const s = await openSession("e3", cfg, E3_COLUMNS);
  const records: RunRecord[] = [];
  try {
    runs: for (let run = 1; run <= cfg.runs; run++) {
      for (const mode of E3_MODES) {
        const record = await runOnce(s, run, mode);
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
  console.log(`KẾT LUẬN E3: ${verdict} — ${verdictReason(verdict, records)}`);
  return verdict;
});

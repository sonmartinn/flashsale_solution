// npm run e2 -- [--runs n] [--stock n] [--soldout-requests n] [--sale id] [--base-url url] [--smoke [--connections 100,500]]
// E2 (hiệu năng V1 so với V2): mỗi lượt reset đợt sale về tồn kho S rồi bắn hai pha bằng autocannon trên cùng đợt sale:
//   in_stock: đúng S request của S user mới, khác nhau (kỳ vọng S lần 201);
//   sold_out: M request của M user mới khác nữa khi kho đã hết (kỳ vọng M lần 409 SOLD_OUT).
// Độ trễ (p50/p95/p99 nearest-rank), thông lượng và số lỗi thật do harness tự tính. Mỗi (lượt x pha) ghi một dòng
// vào loadtest/results/e2.csv (D-26). E2 chỉ xét tính đúng (không bán quá, đúng S đơn), KHÔNG xét tốc độ (D-25).
// Giao thức đo (D-24): các mức connection theo thứ tự (mặc định 100 -> 300 -> 500); đầu mỗi mức có một lượt khởi động
// không ghi CSV cho từng mode (v1 rồi v2); các lượt đo xen kẽ mode đi trước (lượt lẻ v1,v2; lượt chẵn v2,v1); trước
// MỌI lần gọi autocannon, bộ canh cổng TIME_WAIT chờ cho tới khi đủ cổng tạm thời cho `connections` socket mới.
// Mọi lượt đo đều được ghi, kể cả lượt có lỗi thật: không bỏ, không cắt, không chạy lại lượt nào.
// Cuối phiên in trung vị rps, p50, p95 theo (connections, mode, phase); không ghi file tổng hợp (D-26).
// Cần backend chạy `npm run start:test` ở terminal khác (D-02). Mã thoát: 0 VALID, 1 FAIL, 2 INVALID.
import { runPhase, type PhaseResult } from "../lib/autocannon-phase.js";
import { realErrors } from "../lib/classify.js";
import { E2_USAGE, E2_WARMUP, parseE2Args, type E2Config } from "../lib/config.js";
import { E2_COLUMNS, type CsvValue } from "../lib/csv.js";
import { envColumns } from "../lib/env-info.js";
import { median, summarize } from "../lib/histogram.js";
import { countDistinct } from "../lib/ids.js";
import { waitForPortBudget } from "../lib/ports.js";
import { classifyReconcile, runReconcile } from "../lib/reconcile.js";
import { closeSession, openSession, runExperiment, type Session } from "../lib/session.js";
import { InvalidError, type ReconcileOutcome, type StatsSnapshot } from "../lib/types.js";
import { combineE2, judgeE2Run, type E2Judgement, type E2RowJudgement, type E2Status } from "../lib/verdict.js";

type Mode = "v1" | "v2";
type PhaseName = "in_stock" | "sold_out";
const MODES: readonly Mode[] = ["v1", "v2"];
const PHASES: readonly PhaseName[] = ["in_stock", "sold_out"];

/** Một lượt đo (run 0 là lượt khởi động): trạng thái chung và lý do (để in dòng KẾT LUẬN). */
interface RunRecord {
  connections: number;
  mode: Mode;
  run: number;
  status: E2Status;
  reasons: string[];
}

/** Số liệu của một dòng CSV đã ghi, giữ lại cho bảng trung vị cuối phiên. */
interface RowRecord {
  connections: number;
  mode: Mode;
  phase: PhaseName;
  rps: number;
  p50: number;
  p95: number;
}

/** Một pha đã đo kèm thời gian chờ cổng trước nó. */
interface PacedPhase {
  result: PhaseResult;
  waitedMs: number;
  /** Số socket TIME_WAIT lúc bắt đầu; null khi bộ canh bị bỏ qua (không có netstat) */
  timeWait: number | null;
}

/** rps = số phản hồi / thời lượng do harness đo x 1000; NaN (ô trống) khi không có thời lượng. */
function rpsOf(p: PhaseResult): number {
  return p.durationMs > 0 ? (p.responses / p.durationMs) * 1000 : Number.NaN;
}

/**
 * Canh cổng TIME_WAIT (dự kiến `c` socket mới) rồi chạy một pha. InvalidError của bộ canh (quá thời gian chờ)
 * được ném tiếp để lượt thành INVALID.
 */
async function pacedPhase(s: Session, c: number, mode: Mode, ids: string[]): Promise<PacedPhase> {
  const guard = await waitForPortBudget({ port: s.port, planned: c });
  const result = await runPhase({ baseUrl: s.cfg.baseUrl, saleId: s.saleId, mode, connections: c, ids });
  return { result, waitedMs: guard.waitedMs, timeWait: guard.skipped ? null : guard.timeWait };
}

/** Ghi chú "chờ cổng <n> s" khi bộ canh thật sự đã chờ trước pha. */
function waitNote(p: PacedPhase | null): string[] {
  return p !== null && p.waitedMs > 0 ? [`chờ cổng ${Math.round(p.waitedMs / 1000)} s`] : [];
}

/** Một dòng e2.csv theo đúng schema đã đóng băng (D-26). p là null khi pha không chạy được. */
function e2Row(
  s: Session,
  cfg: E2Config,
  c: number,
  mode: Mode,
  run: number,
  phase: PhaseName,
  requests: number,
  p: PhaseResult | null,
  judgement: E2RowJudgement,
  extraNotes: string[],
): Record<string, CsvValue> {
  const sum = p === null ? null : summarize(p.latencies);
  const notes: string[] = [];
  if (cfg.smoke) notes.push("smoke");
  notes.push(...extraNotes, ...judgement.reasons);
  return {
    ...envColumns(s.env),
    connections: c,
    mode,
    run,
    phase,
    requests,
    totalQty: cfg.stock,
    durationMs: p?.durationMs ?? null,
    rps: p === null ? null : rpsOf(p),
    p50Ms: sum?.p50 ?? null,
    p95Ms: sum?.p95 ?? null,
    p99Ms: sum?.p99 ?? null,
    meanMs: sum?.mean ?? null,
    maxMs: sum?.max ?? null,
    s201: p?.counts.s201 ?? null,
    s409SoldOut: p?.counts.s409SoldOut ?? null,
    s409AlreadyBought: p?.counts.s409AlreadyBought ?? null,
    s5xx: p?.counts.s5xx ?? null,
    connErrors: p?.counts.connErrors ?? null,
    timeouts: p?.counts.timeouts ?? null,
    realErrors: p === null ? null : realErrors(p.counts),
    status: judgement.status,
    note: notes.join("; "),
  };
}

/** Pha ở dạng ghi được ra JSON (Float64Array -> mảng số), kèm thời gian chờ cổng. */
function phaseJson(p: PacedPhase | null): unknown {
  if (p === null) return null;
  return {
    ...p.result,
    latencies: Array.from(p.result.latencies),
    summary: summarize(p.result.latencies),
    waitedMs: Math.round(p.waitedMs),
    timeWait: p.timeWait,
  };
}

/** Mô tả ngắn một pha cho dòng console. */
function describePhase(name: string, p: PacedPhase | null): string {
  if (p === null) return `${name}: không đo`;
  const r = p.result;
  const sum = summarize(r.latencies);
  return (
    `${name}: ${rpsOf(r).toFixed(0)} req/s, p50 ${sum.p50.toFixed(1)} ms, p95 ${sum.p95.toFixed(1)} ms, ` +
    `201=${r.counts.s201}, 409=${r.counts.s409SoldOut + r.counts.s409AlreadyBought}, lỗi thật=${realErrors(r.counts)}`
  );
}

/**
 * Lượt khởi động của một mode ở mức connection `c` (D-24): reset về W, một pha in_stock và một pha sold_out W request,
 * chỉ ghi JSON thô, không ghi CSV và không phán quyết. Trả về RunRecord INVALID (run 0) khi reset sai, có 401 hoặc
 * bộ canh cổng hết thời gian chờ; ngược lại null.
 */
async function warmUp(s: Session, cfg: E2Config, c: number, mode: Mode): Promise<RunRecord | null> {
  const W = Math.min(E2_WARMUP, cfg.stock, cfg.soldoutRequests);
  let pIn: PacedPhase | null = null;
  let pOut: PacedPhase | null = null;
  const reasons: string[] = [];
  try {
    await s.resetAndCheck(mode, W);
    pIn = await pacedPhase(s, c, mode, s.ids.nextBlock(W));
    pOut = await pacedPhase(s, c, mode, s.ids.nextBlock(W));
    const s401 = pIn.result.counts.s401 + pOut.result.counts.s401;
    if (s401 > 0) reasons.push(`lượt khởi động có 401 (${s401})`);
  } catch (err) {
    if (!(err instanceof InvalidError)) throw err;
    reasons.push(`lượt khởi động: ${err.message}`);
  }
  s.raw(`c${c}-${mode}-warmup`, {
    connections: c,
    mode,
    warmup: true,
    totalQty: W,
    inStock: phaseJson(pIn),
    soldOut: phaseJson(pOut),
    reasons,
  });
  console.log(
    `c=${c} khởi động ${mode} (W=${W}, không ghi CSV): ${describePhase("in_stock", pIn)} | ${describePhase("sold_out", pOut)}` +
      `${reasons.length > 0 ? ` -> INVALID (${reasons.join("; ")})` : ""}`,
  );
  return reasons.length > 0 ? { connections: c, mode, run: 0, status: "INVALID", reasons } : null;
}

/**
 * Một lượt đo của một mode ở một mức connection: reset có kiểm tra, pha in_stock, stats, pha sold_out, stats,
 * đối soát (v2), phán quyết, hai dòng CSV và một file JSON thô. Lỗi INVALID ở bất kỳ bước nào vẫn ghi đủ hai
 * dòng (ô chưa đo để trống) trước khi trả về, để phiên dừng mà bằng chứng còn nguyên.
 */
async function measuredRun(
  s: Session,
  cfg: E2Config,
  c: number,
  run: number,
  mode: Mode,
  rows: RowRecord[],
): Promise<RunRecord> {
  let statsBefore: StatsSnapshot | null = null;
  let pIn: PacedPhase | null = null;
  let pOut: PacedPhase | null = null;
  let statsIn: StatsSnapshot | null = null;
  let statsOut: StatsSnapshot | null = null;
  let reconcile: ReconcileOutcome = "n/a";
  let reconcileCode: number | null = null;
  let reconcileOut = "";
  let judgement: E2Judgement;
  try {
    statsBefore = await s.resetAndCheck(mode, cfg.stock);
    pIn = await pacedPhase(s, c, mode, s.ids.nextBlock(cfg.stock));
    statsIn = await s.admin.stats(s.saleId);
    pOut = await pacedPhase(s, c, mode, s.ids.nextBlock(cfg.soldoutRequests));
    statsOut = await s.admin.stats(s.saleId);
    if (mode === "v2") {
      const rec = await runReconcile(s.saleId);
      reconcileCode = rec.code;
      reconcileOut = rec.out;
      reconcile = classifyReconcile(rec.code, rec.out);
    }
    judgement = judgeE2Run({
      mode,
      S: cfg.stock,
      inStock: {
        requests: cfg.stock,
        setupCalls: pIn.result.setupCalls,
        distinctIds: countDistinct(pIn.result.sentIds),
        counts: pIn.result.counts,
        stats: statsIn,
      },
      soldOut: {
        requests: cfg.soldoutRequests,
        setupCalls: pOut.result.setupCalls,
        distinctIds: countDistinct(pOut.result.sentIds),
        counts: pOut.result.counts,
        stats: statsOut,
      },
      reconcile,
    });
  } catch (err) {
    if (!(err instanceof InvalidError)) throw err;
    const row: E2RowJudgement = { status: "INVALID", reasons: [err.message] };
    judgement = { inStock: row, soldOut: row, run: "INVALID" };
  }

  const phases: Array<[PhaseName, number, PacedPhase | null, E2RowJudgement]> = [
    ["in_stock", cfg.stock, pIn, judgement.inStock],
    ["sold_out", cfg.soldoutRequests, pOut, judgement.soldOut],
  ];
  for (const [phase, requests, p, j] of phases) {
    const result = p?.result ?? null;
    s.csv.append(e2Row(s, cfg, c, mode, run, phase, requests, result, j, waitNote(p)));
    if (result !== null) {
      const sum = summarize(result.latencies);
      rows.push({ connections: c, mode, phase, rps: rpsOf(result), p50: sum.p50, p95: sum.p95 });
    }
  }
  // JSON thô của lượt (D-12): số liệu đo được và mảng độ trễ đầy đủ, không có token hay mật khẩu
  s.raw(`c${c}-${mode}-run${run}`, {
    connections: c,
    mode,
    run,
    totalQty: cfg.stock,
    soldoutRequests: cfg.soldoutRequests,
    smoke: cfg.smoke,
    statsBefore,
    inStock: phaseJson(pIn),
    statsAfterInStock: statsIn,
    soldOut: phaseJson(pOut),
    statsAfterSoldOut: statsOut,
    reconcile: { outcome: reconcile, code: reconcileCode, out: reconcileOut },
    judgement,
  });

  const reasons = [...judgement.inStock.reasons, ...judgement.soldOut.reasons];
  console.log(
    `c=${c} lượt ${run} ${mode}: ${describePhase("in_stock", pIn)} | ${describePhase("sold_out", pOut)}` +
      `${mode === "v2" ? `, đối soát=${reconcile}` : ""} -> ${judgement.run}` +
      `${reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}`,
  );
  return { connections: c, mode, run, status: judgement.run, reasons };
}

/** Thứ tự mode của lượt đo `run`: lượt lẻ v1 trước, lượt chẵn v2 trước (D-24). */
function modeOrder(run: number): readonly Mode[] {
  return run % 2 === 1 ? MODES : [...MODES].reverse();
}

/** Định dạng một số cho bảng (NaN thành "-"). */
function fmt(v: number, digits: number): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "-";
}

/** Trung vị của các giá trị đo được (bỏ NaN của pha không có phản hồi). */
function medianOf(values: number[]): number {
  return median(values.filter((v) => Number.isFinite(v)));
}

/** Bảng trung vị theo (connections, mode, phase) trên mọi dòng đo đã ghi (D-26). */
function printMedians(rows: RowRecord[], cfg: E2Config): void {
  console.log("");
  console.log(
    `Trung vị E2 (S=${cfg.stock}, M=${cfg.soldoutRequests}, ${cfg.runs} lượt dự kiến mỗi mode mỗi mức` +
      `${cfg.smoke ? ", smoke" : ""}):`,
  );
  const header = ["connections", "mode", "phase", "lượt", "rps", "p50 ms", "p95 ms"];
  const table: string[][] = [];
  for (const c of cfg.connections) {
    for (const mode of MODES) {
      for (const phase of PHASES) {
        const group = rows.filter((r) => r.connections === c && r.mode === mode && r.phase === phase);
        if (group.length === 0) continue;
        table.push([
          String(c),
          mode,
          phase,
          String(group.length),
          fmt(medianOf(group.map((r) => r.rps)), 0),
          fmt(medianOf(group.map((r) => r.p50)), 1),
          fmt(medianOf(group.map((r) => r.p95)), 1),
        ]);
      }
    }
  }
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((r) => (r[i] as string).length)));
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) => cell.padEnd(widths[i] as number))
      .join("  ")
      .trimEnd();
  console.log(line(header));
  for (const r of table) console.log(line(r));
  console.log("");
}

/** Lý do ngắn cho dòng KẾT LUẬN. */
function verdictReason(verdict: E2Status, records: RunRecord[]): string {
  const label = (r: RunRecord): string => `c=${r.connections} ${r.run === 0 ? "khởi động" : `lượt ${r.run}`} ${r.mode}`;
  if (verdict === "INVALID") {
    const bad = records.find((r) => r.status === "INVALID");
    return bad === undefined
      ? "không có lượt nào chạy xong"
      : `dừng ở ${label(bad)}: ${bad.reasons.join("; ")}; E2 không xét tốc độ`;
  }
  if (verdict === "FAIL") {
    const failed = records.filter((r) => r.status === "FAIL");
    const shown = failed.slice(0, 3).map((r) => `${label(r)} (${r.reasons.join("; ")})`);
    return `${failed.length} lượt FAIL: ${shown.join(", ")}${failed.length > 3 ? ", ..." : ""}; E2 không xét tốc độ`;
  }
  return `${records.length} lượt đo đều đúng (không bán quá, đúng tồn kho); E2 không xét tốc độ`;
}

await runExperiment("e2", E2_USAGE, async () => {
  const cfg = parseE2Args(process.argv.slice(2), process.env);
  const s = await openSession("e2", cfg, E2_COLUMNS);
  const records: RunRecord[] = [];
  const rows: RowRecord[] = [];
  try {
    levels: for (const c of cfg.connections) {
      // Khởi động từng mode trước khối đo của mức này (D-24)
      for (const mode of MODES) {
        const bad = await warmUp(s, cfg, c, mode);
        if (bad !== null) {
          records.push(bad);
          break levels;
        }
      }
      for (let run = 1; run <= cfg.runs; run++) {
        for (const mode of modeOrder(run)) {
          const record = await measuredRun(s, cfg, c, run, mode, rows);
          records.push(record);
          // INVALID dừng cả phiên; FAIL thì đo tiếp, không thử lại và không bỏ lượt nào (D-25)
          if (record.status === "INVALID") break levels;
        }
      }
    }
  } finally {
    await closeSession(s);
  }
  const verdict = combineE2(records.map((r) => r.status));
  printMedians(rows, cfg);
  console.log(`KẾT LUẬN E2: ${verdict} — ${verdictReason(verdict, records)}`);
  return verdict;
});

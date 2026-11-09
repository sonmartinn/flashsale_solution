// npm run e2 -- [--runs n] [--stock n] [--soldout-requests n] [--sale id] [--base-url url] [--smoke [--connections 100,500]]
// E2 (hiệu năng V1 so với V2): mỗi lượt reset đợt sale về tồn kho S rồi bắn hai pha bằng autocannon trên cùng đợt sale:
//   in_stock: đúng S request của S user mới, khác nhau (kỳ vọng S lần 201);
//   sold_out: M request của M user mới khác nữa khi kho đã hết (kỳ vọng M lần 409 SOLD_OUT).
// Độ trễ (p50/p95/p99 nearest-rank), thông lượng và số lỗi thật do harness tự tính. Mỗi (lượt x pha) ghi một dòng
// vào loadtest/results/e2.csv (D-26). E2 chỉ xét tính đúng (không bán quá, đúng S đơn), KHÔNG xét tốc độ (D-25).
// Cần backend chạy `npm run start:test` ở terminal khác (D-02). Mã thoát: 0 VALID, 1 FAIL, 2 INVALID.
import { runPhase, type PhaseResult } from "../lib/autocannon-phase.js";
import { realErrors } from "../lib/classify.js";
import { E2_USAGE, parseE2Args, type E2Config } from "../lib/config.js";
import { E2_COLUMNS, type CsvValue } from "../lib/csv.js";
import { envColumns } from "../lib/env-info.js";
import { summarize } from "../lib/histogram.js";
import { countDistinct } from "../lib/ids.js";
import { classifyReconcile, runReconcile } from "../lib/reconcile.js";
import { closeSession, openSession, runExperiment, type Session } from "../lib/session.js";
import { InvalidError, type ReconcileOutcome, type StatsSnapshot } from "../lib/types.js";
import { combineE2, judgeE2Run, type E2Judgement, type E2RowJudgement, type E2Status } from "../lib/verdict.js";

type Mode = "v1" | "v2";
type PhaseName = "in_stock" | "sold_out";
const MODES: readonly Mode[] = ["v1", "v2"];

/** Một lượt đo: trạng thái chung và lý do (để in dòng KẾT LUẬN). */
interface RunRecord {
  connections: number;
  mode: Mode;
  run: number;
  status: E2Status;
  reasons: string[];
}

/** rps = số phản hồi / thời lượng do harness đo x 1000; NaN (ô trống) khi không có thời lượng. */
function rpsOf(p: PhaseResult): number {
  return p.durationMs > 0 ? (p.responses / p.durationMs) * 1000 : Number.NaN;
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

/** PhaseResult ở dạng ghi được ra JSON (Float64Array -> mảng số). */
function phaseJson(p: PhaseResult | null): unknown {
  if (p === null) return null;
  return { ...p, latencies: Array.from(p.latencies), summary: summarize(p.latencies) };
}

/**
 * Một lượt đo của một mode ở một mức connection: reset có kiểm tra, pha in_stock, stats, pha sold_out, stats,
 * đối soát (v2), phán quyết, hai dòng CSV và một file JSON thô. Lỗi INVALID ở bất kỳ bước nào vẫn ghi đủ hai
 * dòng (ô chưa đo để trống) trước khi trả về, để phiên dừng mà bằng chứng còn nguyên.
 */
async function measuredRun(s: Session, cfg: E2Config, c: number, run: number, mode: Mode): Promise<RunRecord> {
  let statsBefore: StatsSnapshot | null = null;
  let pIn: PhaseResult | null = null;
  let pOut: PhaseResult | null = null;
  let statsIn: StatsSnapshot | null = null;
  let statsOut: StatsSnapshot | null = null;
  let reconcile: ReconcileOutcome = "n/a";
  let reconcileCode: number | null = null;
  let reconcileOut = "";
  let judgement: E2Judgement;
  try {
    statsBefore = await s.resetAndCheck(mode, cfg.stock);
    const inIds = s.ids.nextBlock(cfg.stock);
    pIn = await runPhase({ baseUrl: s.cfg.baseUrl, saleId: s.saleId, mode, connections: c, ids: inIds });
    statsIn = await s.admin.stats(s.saleId);
    const outIds = s.ids.nextBlock(cfg.soldoutRequests);
    pOut = await runPhase({ baseUrl: s.cfg.baseUrl, saleId: s.saleId, mode, connections: c, ids: outIds });
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
        setupCalls: pIn.setupCalls,
        distinctIds: countDistinct(pIn.sentIds),
        counts: pIn.counts,
        stats: statsIn,
      },
      soldOut: {
        requests: cfg.soldoutRequests,
        setupCalls: pOut.setupCalls,
        distinctIds: countDistinct(pOut.sentIds),
        counts: pOut.counts,
        stats: statsOut,
      },
      reconcile,
    });
  } catch (err) {
    if (!(err instanceof InvalidError)) throw err;
    const row: E2RowJudgement = { status: "INVALID", reasons: [err.message] };
    judgement = { inStock: row, soldOut: row, run: "INVALID" };
  }

  s.csv.append(e2Row(s, cfg, c, mode, run, "in_stock", cfg.stock, pIn, judgement.inStock, []));
  s.csv.append(e2Row(s, cfg, c, mode, run, "sold_out", cfg.soldoutRequests, pOut, judgement.soldOut, []));
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

  const describe = (name: string, p: PhaseResult | null): string => {
    if (p === null) return `${name}: không đo`;
    const sum = summarize(p.latencies);
    return (
      `${name}: ${rpsOf(p).toFixed(0)} req/s, p50 ${sum.p50.toFixed(1)} ms, p95 ${sum.p95.toFixed(1)} ms, ` +
      `201=${p.counts.s201}, 409=${p.counts.s409SoldOut + p.counts.s409AlreadyBought}, lỗi thật=${realErrors(p.counts)}`
    );
  };
  const reasons = [...judgement.inStock.reasons, ...judgement.soldOut.reasons];
  console.log(
    `c=${c} lượt ${run} ${mode}: ${describe("in_stock", pIn)} | ${describe("sold_out", pOut)}` +
      `${mode === "v2" ? `, đối soát=${reconcile}` : ""} -> ${judgement.run}` +
      `${reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}`,
  );
  return { connections: c, mode, run, status: judgement.run, reasons };
}

/** Lý do ngắn cho dòng KẾT LUẬN. */
function verdictReason(verdict: E2Status, records: RunRecord[]): string {
  if (verdict === "INVALID") {
    const bad = records.find((r) => r.status === "INVALID");
    return bad === undefined
      ? "không có lượt nào chạy xong"
      : `dừng ở c=${bad.connections} lượt ${bad.run} ${bad.mode}: ${bad.reasons.join("; ")}`;
  }
  if (verdict === "FAIL") {
    const failed = records.filter((r) => r.status === "FAIL");
    const shown = failed.slice(0, 3).map((r) => `c=${r.connections} lượt ${r.run} ${r.mode} (${r.reasons.join("; ")})`);
    return `${failed.length} lượt FAIL: ${shown.join(", ")}${failed.length > 3 ? ", ..." : ""}`;
  }
  return `${records.length} lượt đo đều đúng (không bán quá, đúng tồn kho); E2 không xét tốc độ`;
}

await runExperiment("e2", E2_USAGE, async () => {
  const cfg = parseE2Args(process.argv.slice(2), process.env);
  const s = await openSession("e2", cfg, E2_COLUMNS);
  const records: RunRecord[] = [];
  try {
    levels: for (const c of cfg.connections) {
      for (let run = 1; run <= cfg.runs; run++) {
        for (const mode of MODES) {
          const record = await measuredRun(s, cfg, c, run, mode);
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
  console.log(`KẾT LUẬN E2: ${verdict} — ${verdictReason(verdict, records)}`);
  return verdict;
});

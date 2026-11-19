// E4: dừng MongoDB giữa lúc bán V2, sau đó áp dụng đúng runbook reconcile -> --fix -> kiểm tra lại.
import { emptyCounts, type ResponseCounts } from "../lib/classify.js";
import {
  E4_HEALTH_TIMEOUT_MS,
  E4_HOLD_MS,
  E4_STOP_RATIO,
  E4_USAGE,
  parseE4Args,
  type E4Config,
} from "../lib/config.js";
import { E4_COLUMNS, type CsvValue } from "../lib/csv.js";
import { dockerMongo, mongoContainerRunning } from "../lib/docker.js";
import { envColumns } from "../lib/env-info.js";
import { buyOnce } from "../lib/http.js";
import { waitForPortBudget } from "../lib/ports.js";
import { classifyReconcile, parseReconcileDrift, runReconcile } from "../lib/reconcile.js";
import { closeSession, openSession, runExperiment, type Session } from "../lib/session.js";
import { InvalidError, type ReconcileOutcome, type RunStatus, type StatsSnapshot } from "../lib/types.js";
import { combineRuns, judgeE4Run } from "../lib/verdict.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface E4Measured {
  stopAfter201: number | null;
  counts: ResponseCounts;
  codes: Record<string, number>;
  sent: number;
  distinctIds: number;
  mongoStopped: boolean;
  stats: StatsSnapshot | null;
  reconcile: ReconcileOutcome;
  reconcileCode: number | null;
  reconcileOut: string;
  drift: { missing: number; extra: number } | null;
  driftUnits: number | null;
  fixCode: number | null;
  fixOut: string;
  reconcileAfterFix: ReconcileOutcome;
  afterCode: number | null;
  afterOut: string;
  max5xxLatencyMs: number | null;
  durationMs: number;
}

function e4Row(s: Session, m: E4Measured, status: RunStatus, reasons: string[]): Record<string, CsvValue> {
  return {
    ...envColumns(s.env),
    stopAfter201: m.stopAfter201,
    s201: m.counts.s201,
    s409: m.counts.s409SoldOut + m.counts.s409AlreadyBought,
    s5xx: m.counts.s5xx,
    driftUnits: m.driftUnits,
    connErrors: m.counts.connErrors + m.counts.timeouts,
    ordersAfter: m.stats?.orders ?? null,
    redisStockAfter: m.stats?.redisStock ?? null,
    redisBuyersAfter: m.stats?.redisBuyers ?? null,
    reconcile: m.reconcile === "invalid" ? "n/a" : m.reconcile,
    fixApplied: m.reconcile === "drift" ? (m.fixCode === 0 ? "yes" : "failed") : "no",
    reconcileAfterFix: m.reconcileAfterFix === "invalid" ? "n/a" : m.reconcileAfterFix,
    status,
    note: reasons.join("; "),
  };
}

async function waitForHealthy(s: Session): Promise<void> {
  const deadline = Date.now() + E4_HEALTH_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const health = await s.admin.health();
    if (health.httpStatus === 200 && health.mongo && health.redis) return;
    await sleep(2000);
  }
  throw new InvalidError(`MongoDB chưa khỏe lại sau ${Math.round(E4_HEALTH_TIMEOUT_MS / 1000)} giây`);
}

async function runOnce(s: Session, cfg: E4Config, run: number): Promise<RunStatus> {
  const m: E4Measured = {
    stopAfter201: null,
    counts: emptyCounts(),
    codes: {},
    sent: 0,
    distinctIds: 0,
    mongoStopped: false,
    stats: null,
    reconcile: "invalid",
    reconcileCode: null,
    reconcileOut: "",
    drift: null,
    driftUnits: null,
    fixCode: null,
    fixOut: "",
    reconcileAfterFix: "invalid",
    afterCode: null,
    afterOut: "",
    max5xxLatencyMs: null,
    durationMs: 0,
  };
  let stopIssued = false;
  let mongoStarted = false;
  let stopIssuing = false;
  let outage: Promise<void> | null = null;
  const usedIds = new Set<string>();
  const threshold = Math.ceil(E4_STOP_RATIO * cfg.stock);
  const startedAt = performance.now();
  let status: RunStatus = "INVALID";
  let reasons: string[] = [];

  const beginOutage = (): void => {
    if (outage !== null) return;
    m.stopAfter201 = m.counts.s201;
    outage = (async () => {
      stopIssued = true;
      const stopped = await dockerMongo("stop");
      if (stopped.code !== 0) throw new InvalidError(`Không dừng được MongoDB: ${stopped.out.trim()}`);
      m.mongoStopped = true;
      await sleep(E4_HOLD_MS);
      stopIssuing = true;
    })();
    // Bắt lỗi ngay khi lệnh Docker thất bại; await bên dưới vẫn nhận lại lỗi để khôi phục trong finally.
    void outage.catch(() => {
      stopIssuing = true;
    });
  };

  try {
    await waitForPortBudget({ port: s.port, planned: cfg.concurrency });
    await s.resetAndCheck("v2", cfg.stock);
    const deadline = Date.now() + 120_000;
    const next = s.ids.stream();
    const worker = async (): Promise<void> => {
      while (!stopIssuing) {
        if (Date.now() > deadline) {
          stopIssuing = true;
          return;
        }
        const userId = next();
        usedIds.add(userId);
        m.sent += 1;
        const requestStartedAt = performance.now();
        const result = await buyOnce({ baseUrl: s.cfg.baseUrl, saleId: s.saleId, mode: "v2", userId, timeoutMs: 30_000 });
        m.counts[result.bucket] += 1;
        m.codes[result.key] = (m.codes[result.key] ?? 0) + 1;
        if (result.bucket === "s5xx") {
          const latency = performance.now() - requestStartedAt;
          m.max5xxLatencyMs = Math.max(m.max5xxLatencyMs ?? 0, latency);
        }
        if (m.counts.s201 >= threshold) beginOutage();
        if (m.counts.s201 >= cfg.stock && outage === null) {
          stopIssuing = true;
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: cfg.concurrency }, () => worker()));
    if (outage === null) throw new InvalidError(`Không đạt ngưỡng dừng MongoDB (${m.counts.s201}/${threshold}) trong 120 giây`);
    await outage;
    if (Date.now() > deadline) throw new InvalidError("E4 quá 120 giây trước khi hoàn tất tải");

    // Chỉ khởi động lại sau khi toàn bộ request đang bay đã kết thúc, tránh hoàn kho tùy thời điểm.
    const restarted = await dockerMongo("start");
    mongoStarted = restarted.code === 0;
    if (!mongoStarted) throw new InvalidError(`Không khởi động lại MongoDB: ${restarted.out.trim()}`);
    await waitForHealthy(s);

    m.stats = await s.admin.stats(s.saleId);
    const reconcile = await runReconcile(s.saleId);
    m.reconcileCode = reconcile.code;
    m.reconcileOut = reconcile.out;
    m.reconcile = classifyReconcile(reconcile.code, reconcile.out);
    m.drift = parseReconcileDrift(reconcile.out);
    m.driftUnits = m.stats.redisStock === null ? null : m.stats.totalQty - m.stats.orders - m.stats.redisStock;
    const fixed = await runReconcile(s.saleId, { fix: true });
    m.fixCode = fixed.code;
    m.fixOut = fixed.out;
    const after = await runReconcile(s.saleId);
    m.afterCode = after.code;
    m.afterOut = after.out;
    m.reconcileAfterFix = classifyReconcile(after.code, after.out);
    const judgement = judgeE4Run({
      totalQty: cfg.stock,
      sent: m.sent,
      distinctIds: usedIds.size,
      counts: m.counts,
      stats: m.stats,
      mongoStopped: m.mongoStopped,
      reconcile: m.reconcile,
      reconcileAfterFix: m.reconcileAfterFix,
      drift: m.drift,
      driftUnits: m.driftUnits,
      fixExitCode: m.fixCode,
    });
    status = judgement.status;
    reasons = judgement.reasons;
  } catch (err) {
    if (!(err instanceof InvalidError)) throw err;
    status = "INVALID";
    reasons = [err.message];
  } finally {
    m.durationMs = performance.now() - startedAt;
    if (stopIssued && !mongoStarted) {
      const restarted = await dockerMongo("start");
      mongoStarted = restarted.code === 0;
      if (!mongoStarted) reasons.push(`không tự khởi động lại được MongoDB: ${restarted.out.trim()}`);
    }
  }

  s.csv.append(e4Row(s, m, status, reasons));
  const rawPath = s.raw(`run${run}`, {
    run,
    totalQty: cfg.stock,
    threshold,
    counts: m.counts,
    codes: m.codes,
    sent: m.sent,
    distinctIds: usedIds.size,
    stopAfter201: m.stopAfter201,
    mongoStopped: m.mongoStopped,
    statsAfter: m.stats,
    reconcile: { outcome: m.reconcile, code: m.reconcileCode, out: m.reconcileOut },
    drift: m.drift,
    driftUnits: m.driftUnits,
    fix: { code: m.fixCode, out: m.fixOut },
    reconcileAfterFix: { outcome: m.reconcileAfterFix, code: m.afterCode, out: m.afterOut },
    max5xxLatencyMs: m.max5xxLatencyMs,
    durationMs: m.durationMs,
    judgement: { status, reasons },
  });
  if (m.reconcile === "drift") console.log("E4 đã chạy runbook SPECS §8: reconcile -> --fix -> kiểm tra lại.");
  console.log(`Lượt ${run} E4: 201=${m.counts.s201}, 5xx=${m.counts.s5xx}, drift=${m.reconcile} -> ${status}`);
  console.log(`Dữ liệu thô E4: ${rawPath}`);
  return status;
}

await runExperiment("e4", E4_USAGE, async () => {
  const cfg = parseE4Args(process.argv.slice(2), process.env);
  if (!mongoContainerRunning()) throw new InvalidError("flashsale-mongo chưa chạy; từ chối bắt đầu E4");
  const s = await openSession("e4", cfg, E4_COLUMNS);
  const statuses: RunStatus[] = [];
  try {
    for (let run = 1; run <= cfg.runs; run++) {
      const status = await runOnce(s, cfg, run);
      statuses.push(status);
      if (status === "INVALID") break;
    }
  } finally {
    await closeSession(s);
  }
  const verdict = combineRuns(statuses);
  console.log(`KẾT LUẬN E4: ${verdict} — ${verdict === "PASS" ? "không bán quá, runbook đã khôi phục đồng bộ" : "xem CSV và JSON thô"}`);
  return verdict;
});

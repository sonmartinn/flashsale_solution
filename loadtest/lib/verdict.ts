// Luật PASS/FAIL/INVALID của E1 và E3 và mã thoát (D-13, D-14, D-15, D-16, D-19).
//
// INVALID: phép đo không đáng tin (môi trường hỏng), nên luôn xét trước FAIL.
// FAIL: phép đo đáng tin và khẳng định bị phá (V0 không bán quá, V1/V2 sai số đơn, E3 rò rỉ tồn kho).
// Không có thử lại tự động ở bất kỳ đâu: một lượt FAIL được báo đúng như nó là (D-14).
import { realErrors, type ResponseCounts } from "./classify.js";
import type { ReconcileOutcome, RunStatus, SaleMode, StatsSnapshot } from "./types.js";

export interface RunJudgement {
  status: RunStatus;
  /** Lý do ngắn bằng tiếng Việt; cột note của CSV nối chúng bằng "; " */
  reasons: string[];
}

export interface E1RunInput {
  mode: SaleMode;
  users: number;
  /** Số id khác nhau đã gửi */
  distinctIds: number;
  counts: ResponseCounts;
  stats: StatsSnapshot;
  reconcile: ReconcileOutcome;
}

export interface E3RunInput {
  mode: "v1" | "v2";
  requests: number;
  distinctIds: number;
  counts: ResponseCounts;
  stats: StatsSnapshot;
  reconcile: ReconcileOutcome;
}

export interface E3Judgement extends RunJudgement {
  /** totalQty - 1: một đơn duy nhất được bán */
  expectedStock: number;
  /** mongoRemaining (v1) hoặc redisStock (v2) */
  finalStock: number | null;
  stockLeak: boolean;
  /** 401 + 4xx khác */
  sOther: number;
  realErrors: number;
}

/** Các lý do INVALID chung của E1 và E3 (D-13). */
function commonInvalidReasons(
  mode: SaleMode,
  counts: ResponseCounts,
  stats: StatsSnapshot,
  reconcile: ReconcileOutcome,
): string[] {
  const reasons: string[] = [];
  if (counts.s401 > 0) reasons.push(`có 401 (${counts.s401})`);
  const errors = realErrors(counts);
  if (errors > 0) reasons.push(`có lỗi thật (5xx/kết nối/timeout): ${errors}`);
  if (stats.distinctUsers !== stats.orders) {
    reasons.push(`distinctUsers (${stats.distinctUsers}) ≠ orders (${stats.orders})`);
  }
  if (stats.mode !== mode) reasons.push(`stats.mode ${stats.mode} khác mode yêu cầu ${mode}`);
  if (mode === "v2") {
    // V2 bắt buộc có kết quả đối soát dùng được: chỉ clean (mã 0) hoặc drift (mã 2)
    if (reconcile !== "clean" && reconcile !== "drift") reasons.push(`reconcile không dùng được (${reconcile})`);
  } else if (reconcile === "invalid") {
    reasons.push("reconcile không dùng được (invalid)");
  }
  return reasons;
}

/** Phán quyết một lượt E1 (D-13, D-14). */
export function judgeE1Run(input: E1RunInput): RunJudgement {
  const { mode, users, distinctIds, counts, stats, reconcile } = input;
  const invalid: string[] = [];
  if (distinctIds !== users) invalid.push(`số id khác nhau (${distinctIds}) ≠ số user (${users})`);
  invalid.push(...commonInvalidReasons(mode, counts, stats, reconcile));
  if (invalid.length > 0) return { status: "INVALID", reasons: invalid };

  const fail: string[] = [];
  if (mode === "v0") {
    if (stats.oversold === 0) fail.push("V0 không bán quá");
  } else {
    if (stats.orders !== stats.totalQty) fail.push(`orders ≠ totalQty (${stats.orders}/${stats.totalQty})`);
    if (stats.oversold > 0) fail.push(`bán quá ${stats.oversold} đơn`);
    if (mode === "v2") {
      if (reconcile === "drift") fail.push("reconcile báo lệch");
      if (stats.redisInSync === false) fail.push("Redis lệch MongoDB");
    }
  }
  return fail.length > 0 ? { status: "FAIL", reasons: fail } : { status: "PASS", reasons: [] };
}

/** Phán quyết một lượt E3: một user gửi nhiều request đồng thời (D-13, D-19). */
export function judgeE3Run(input: E3RunInput): E3Judgement {
  const { mode, requests, distinctIds, counts, stats, reconcile } = input;
  const expectedStock = stats.totalQty - 1;
  const finalStock = mode === "v1" ? stats.mongoRemaining : stats.redisStock;
  const stockLeak =
    mode === "v1"
      ? stats.mongoRemaining !== expectedStock
      : stats.redisStock !== expectedStock || stats.redisBuyers !== 1 || reconcile !== "clean";
  const extra = {
    expectedStock,
    finalStock,
    stockLeak,
    sOther: counts.s401 + counts.sOther4xx,
    realErrors: realErrors(counts),
  };

  const invalid: string[] = [];
  if (distinctIds !== 1) invalid.push(`số id khác nhau (${distinctIds}) ≠ 1`);
  invalid.push(...commonInvalidReasons(mode, counts, stats, reconcile));
  if (invalid.length > 0) return { status: "INVALID", reasons: invalid, ...extra };

  const fail: string[] = [];
  if (counts.s201 !== 1) fail.push(`số 201 (${counts.s201}) ≠ 1`);
  const s409 = counts.s409SoldOut + counts.s409AlreadyBought;
  if (s409 !== requests - 1) fail.push(`số 409 (${s409}) ≠ ${requests - 1}`);
  if (stats.orders !== 1) fail.push(`số đơn của user (${stats.orders}) ≠ 1`);
  if (stockLeak) fail.push(`rò rỉ tồn kho (còn ${finalStock ?? "null"}, kỳ vọng ${expectedStock})`);
  if (mode === "v2" && stats.redisBuyers !== 1) fail.push(`redisBuyers (${stats.redisBuyers}) ≠ 1`);
  if (mode === "v2" && reconcile === "drift") fail.push("reconcile báo lệch");

  return fail.length > 0
    ? { status: "FAIL", reasons: fail, ...extra }
    : { status: "PASS", reasons: [], ...extra };
}

const SEVERITY: Record<RunStatus, number> = { PASS: 0, FAIL: 1, INVALID: 2 };

/** Trạng thái nặng hơn trong hai: INVALID > FAIL > PASS. */
export function worstStatus(a: RunStatus, b: RunStatus): RunStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

/** Gộp các lượt: không có lượt nào hoặc có INVALID -> INVALID, có FAIL -> FAIL, còn lại PASS (D-15). */
export function combineRuns(statuses: RunStatus[]): RunStatus {
  if (statuses.length === 0) return "INVALID";
  return statuses.reduce<RunStatus>(worstStatus, "PASS");
}

/** Mã thoát của mọi thí nghiệm: 0 PASS/VALID, 1 FAIL, 2 INVALID (D-16). */
export function exitCodeFor(v: RunStatus | "VALID"): 0 | 1 | 2 {
  if (v === "PASS" || v === "VALID") return 0;
  return v === "FAIL" ? 1 : 2;
}

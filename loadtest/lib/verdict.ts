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

// ---------------------------------------------------------------------------------------------------------
// E2 (hiệu năng): chỉ xét TÍNH ĐÚNG của lượt đo, không bao giờ xét tốc độ (D-25, sửa đổi 2026-11-09).
// Không có đầu vào nào về độ trễ hay thông lượng: E2 không gắn nhãn V1/V2 nhanh hơn, chậm hơn hay đạt/trượt.
// Lỗi thật (5xx, lỗi kết nối, timeout) không làm lượt INVALID: chúng là một phần số liệu đo và được đếm.

/** VALID: lượt đo dùng được; FAIL: bất biến tồn kho bị phá; INVALID: phép đo không đáng tin. */
export type E2Status = "VALID" | "FAIL" | "INVALID";

export interface E2PhaseInput {
  /** Số request dự kiến của pha (S hoặc M) */
  requests: number;
  /** Số lần setupRequest được gọi */
  setupCalls: number;
  /** Số id khác nhau đã thật sự gửi */
  distinctIds: number;
  counts: ResponseCounts;
  /** Stats đọc ngay sau pha */
  stats: StatsSnapshot;
}

export interface E2RunInput {
  mode: "v1" | "v2";
  /** Tồn kho của lượt (totalQty) */
  S: number;
  inStock: E2PhaseInput;
  soldOut: E2PhaseInput;
  /** Đối soát sau pha sold_out (v2); v1 là "n/a" */
  reconcile: ReconcileOutcome;
}

export interface E2RowJudgement {
  status: E2Status;
  reasons: string[];
}

export interface E2Judgement {
  inStock: E2RowJudgement;
  soldOut: E2RowJudgement;
  /** Trạng thái nặng hơn của hai dòng */
  run: E2Status;
}

const E2_SEVERITY: Record<E2Status, number> = { VALID: 0, FAIL: 1, INVALID: 2 };

function worstE2(a: E2Status, b: E2Status): E2Status {
  return E2_SEVERITY[b] > E2_SEVERITY[a] ? b : a;
}

/** Lý do INVALID của một pha: 401, số lần setupRequest hay số id khác số request, distinctUsers ≠ orders, sai mode. */
function e2InvalidReasons(mode: "v1" | "v2", p: E2PhaseInput): string[] {
  const reasons: string[] = [];
  if (p.counts.s401 > 0) reasons.push(`có 401 (${p.counts.s401})`);
  if (p.setupCalls !== p.requests) reasons.push(`setupRequest gọi ${p.setupCalls} lần ≠ ${p.requests} request`);
  if (p.distinctIds !== p.requests) reasons.push(`số id khác nhau (${p.distinctIds}) ≠ ${p.requests} request`);
  if (p.stats.distinctUsers !== p.stats.orders) {
    reasons.push(`distinctUsers (${p.stats.distinctUsers}) ≠ orders (${p.stats.orders})`);
  }
  if (p.stats.mode !== mode) reasons.push(`stats.mode ${p.stats.mode} khác mode yêu cầu ${mode}`);
  return reasons;
}

/**
 * Bất biến tồn kho sau một pha (D-25 sửa đổi). Không có lỗi thật: phải đúng S đơn và không bán quá.
 * Có lỗi thật: kho có thể chưa hết một cách hợp lệ, nên chỉ đòi không bán quá và orders <= S, kèm ghi chú.
 */
function e2StockCheck(S: number, stats: StatsSnapshot, errors: number): { fail: string[]; notes: string[] } {
  const fail: string[] = [];
  const notes: string[] = [];
  if (stats.oversold > 0) fail.push(`bán quá ${stats.oversold} đơn`);
  if (errors === 0) {
    if (stats.orders !== S) fail.push(`orders ≠ totalQty (${stats.orders}/${S})`);
  } else if (stats.orders > S) {
    fail.push(`orders > totalQty (${stats.orders}/${S})`);
  } else if (stats.orders < S) {
    notes.push(`kho chưa hết (${stats.orders}/${S}, có ${errors} lỗi thật)`);
  }
  return { fail, notes };
}

/** Phán quyết một lượt E2: một dòng cho pha in_stock, một dòng cho pha sold_out (D-25 sửa đổi 2026-11-09). */
export function judgeE2Run(i: E2RunInput): E2Judgement {
  const { mode, S, inStock, soldOut, reconcile } = i;

  let inRow: E2RowJudgement;
  const inInvalid = e2InvalidReasons(mode, inStock);
  if (inInvalid.length > 0) {
    inRow = { status: "INVALID", reasons: inInvalid };
  } else {
    const { fail, notes } = e2StockCheck(S, inStock.stats, realErrors(inStock.counts));
    inRow = fail.length > 0 ? { status: "FAIL", reasons: fail } : { status: "VALID", reasons: notes };
  }

  let outRow: E2RowJudgement;
  const outInvalid = e2InvalidReasons(mode, soldOut);
  // V2 bắt buộc có kết quả đối soát dùng được (chỉ clean hoặc drift), xét trên dòng sold_out
  if (mode === "v2" && reconcile !== "clean" && reconcile !== "drift") {
    outInvalid.push(`reconcile không dùng được (${reconcile})`);
  }
  if (outInvalid.length > 0) {
    outRow = { status: "INVALID", reasons: outInvalid };
  } else {
    // Lỗi thật của cả hai pha: một request in_stock bị timeout vẫn có thể đã tạo đơn phía server
    const errors = realErrors(inStock.counts) + realErrors(soldOut.counts);
    const { fail, notes } = e2StockCheck(S, soldOut.stats, errors);
    if (mode === "v2") {
      if (reconcile === "drift") fail.push("reconcile báo lệch");
      if (soldOut.stats.redisInSync === false) fail.push("Redis lệch MongoDB");
    }
    outRow = fail.length > 0 ? { status: "FAIL", reasons: fail } : { status: "VALID", reasons: notes };
  }

  return { inStock: inRow, soldOut: outRow, run: worstE2(inRow.status, outRow.status) };
}

/** Gộp các lượt E2: không có lượt nào hoặc có INVALID -> INVALID, có FAIL -> FAIL, còn lại VALID. */
export function combineE2(statuses: E2Status[]): E2Status {
  if (statuses.length === 0) return "INVALID";
  return statuses.reduce<E2Status>(worstE2, "VALID");
}

/** Mã thoát của mọi thí nghiệm: 0 PASS/VALID, 1 FAIL, 2 INVALID (D-16). */
export function exitCodeFor(v: RunStatus | E2Status): 0 | 1 | 2 {
  if (v === "PASS" || v === "VALID") return 0;
  return v === "FAIL" ? 1 : 2;
}

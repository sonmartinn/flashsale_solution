// Khung tạm cho bước RED: chữ ký đúng, chưa có hành vi.
import type { ResponseCounts } from "./classify.js";
import type { ReconcileOutcome, RunStatus, SaleMode, StatsSnapshot } from "./types.js";

export interface RunJudgement {
  status: RunStatus;
  reasons: string[];
}
export interface E1RunInput {
  mode: SaleMode;
  users: number;
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
  expectedStock: number;
  finalStock: number | null;
  stockLeak: boolean;
  sOther: number;
  realErrors: number;
}
export function judgeE1Run(_input: E1RunInput): RunJudgement {
  throw new Error("chưa cài đặt");
}
export function judgeE3Run(_input: E3RunInput): E3Judgement {
  throw new Error("chưa cài đặt");
}
export function worstStatus(_a: RunStatus, _b: RunStatus): RunStatus {
  throw new Error("chưa cài đặt");
}
export function combineRuns(_statuses: RunStatus[]): RunStatus {
  throw new Error("chưa cài đặt");
}
export function exitCodeFor(_v: RunStatus | "VALID"): 0 | 1 | 2 {
  throw new Error("chưa cài đặt");
}

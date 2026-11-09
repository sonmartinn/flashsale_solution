// Khung tạm cho bước RED: chữ ký đúng, chưa có hành vi.
export const BUCKETS = [
  "s201",
  "s409SoldOut",
  "s409AlreadyBought",
  "s401",
  "sOther4xx",
  "s5xx",
  "connErrors",
  "timeouts",
] as const;
export type Bucket = (typeof BUCKETS)[number];
export type ResponseCounts = Record<Bucket, number>;

export function emptyCounts(): ResponseCounts {
  throw new Error("chưa cài đặt");
}
export function classifyStatus(_status: number, _code: string | undefined): Bucket {
  throw new Error("chưa cài đặt");
}
export function classifyFetchError(_err: unknown): "connErrors" | "timeouts" {
  throw new Error("chưa cài đặt");
}
export function parseErrorCode(_body: string): string | undefined {
  throw new Error("chưa cài đặt");
}
export function realErrors(_c: ResponseCounts): number {
  throw new Error("chưa cài đặt");
}

import type { SaleDto } from "./types.ts";

export type SaleMode = SaleDto["mode"];
export const saleModes = ["v0", "v1", "v2"] as const;
export const saleStatuses = ["scheduled", "active", "ended"] as const;

export interface SaleStats {
  saleId: string;
  mode: SaleMode;
  status: SaleDto["status"];
  totalQty: number;
  mongoRemaining: number;
  redisStock: number | null;
  redisBuyers: number;
  orders: number;
  distinctUsers: number;
  oversold: number;
  redisInSync: boolean | null;
  uniqueOrderIndex: boolean;
}

export const saleStatusLabel: Record<SaleStats["status"], string> = {
  scheduled: "Chưa mở", active: "Đang mở", ended: "Đã kết thúc",
};

export function readSaleId(value: string | null): string | undefined {
  const cleaned = value?.trim();
  return cleaned && /^[a-f\d]{24}$/i.test(cleaned) ? cleaned.toLowerCase() : undefined;
}

export function remainingByMode(stats: SaleStats): number | null {
  return stats.mode === "v2" ? stats.redisStock : stats.mongoRemaining;
}

export function syncStatus(stats: SaleStats): string {
  if (stats.mode !== "v2" || stats.redisInSync === null) return "Không áp dụng";
  return stats.redisInSync ? "Khớp số đếm" : "Lệch số đếm";
}

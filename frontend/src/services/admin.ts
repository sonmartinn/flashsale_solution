import { ApiError } from "./api.ts";
import { saleModes, saleStatuses, type SaleMode, type SaleStats } from "./admin-state.ts";
import type { SessionStore } from "./auth.ts";

interface ResetSaleDto {
  saleId: string;
  mode: SaleMode;
  totalQty: number;
  startAt: string;
  endAt: string;
}

function adminPath(saleId: string) {
  return `/admin/sales/${encodeURIComponent(saleId)}`;
}

export async function getSaleStats(store: SessionStore, saleId: string, signal?: AbortSignal): Promise<SaleStats> {
  const { stats } = await store.request<{ stats: SaleStats }>(`${adminPath(saleId)}/stats`, { signal });
  if (stats?.saleId !== saleId || !saleModes.includes(stats.mode) || !saleStatuses.includes(stats.status)
    || ![stats.totalQty, stats.mongoRemaining, stats.redisBuyers, stats.orders, stats.distinctUsers, stats.oversold].every(Number.isSafeInteger)
    || (stats.redisStock !== null && !Number.isSafeInteger(stats.redisStock))
    || (stats.redisInSync !== null && typeof stats.redisInSync !== "boolean") || typeof stats.uniqueOrderIndex !== "boolean") {
    throw new ApiError(200, "Máy chủ trả số liệu không hợp lệ.", "INVALID_RESPONSE");
  }
  return stats;
}

export async function resetSale(store: SessionStore, saleId: string, mode: SaleMode): Promise<ResetSaleDto> {
  const { sale } = await store.request<{ sale: ResetSaleDto }>(`${adminPath(saleId)}/reset`, {
    method: "POST", body: { mode },
  });
  if (sale?.saleId !== saleId || sale.mode !== mode || !Number.isSafeInteger(sale.totalQty)
    || !Number.isFinite(Date.parse(sale.startAt)) || !Number.isFinite(Date.parse(sale.endAt))) {
    throw new ApiError(200, "Máy chủ trả kết quả reset không hợp lệ.", "INVALID_RESPONSE");
  }
  return sale;
}

import type { SaleDto } from "./types.ts";

export interface ServerClock { epoch: number; monotonic: number }
export function synchronizeClock(now: string, monotonic: number): ServerClock {
  const epoch = Date.parse(now);
  if (!Number.isFinite(epoch) || !Number.isFinite(monotonic)) throw new Error("Giờ máy chủ không hợp lệ.");
  return { epoch, monotonic };
}
export const serverTime = (clock: ServerClock, monotonic: number): number => clock.epoch + Math.max(0, monotonic - clock.monotonic);
export const remainingSeconds = (endAt: string, now: number): number => Math.max(0, Math.ceil((Date.parse(endAt) - now) / 1000) || 0);

export function buyUnavailable(sale: SaleDto, now: number, state: { pending?: boolean; stale?: boolean; purchased?: boolean } = {}): string {
  if (state.purchased) return "Bạn đã mua sản phẩm trong đợt sale này.";
  if (state.pending) return "Đang gửi yêu cầu mua…";
  if (state.stale || !Number.isFinite(now)) return "Cần đọc lại dữ liệu trước khi mua.";
  const start = Date.parse(sale.startAt), end = Date.parse(sale.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || sale.status !== "active" || now < start || now >= end) return "Đợt sale chưa mở hoặc đã kết thúc.";
  if (!sale.stockLoaded) return "Kho chưa sẵn sàng.";
  if (sale.remaining <= 0) return "Sản phẩm đã hết hàng.";
  return "";
}

/** Khóa trước lần await đầu tiên, kể cả hai click trong cùng một lượt render. */
export function createSingleFlight() {
  let busy = false;
  return {
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try { return await action(); } finally { busy = false; }
    },
  };
}

// Số còn lại của đợt sale theo mode, CHỈ dùng cho đường đọc (D-21). Không cache: mỗi lần gọi đọc lại kho.
import type { Redis } from "ioredis";
import { stockKey } from "../config/redis.js";
import { Order, type SaleMode } from "../models/index.js";

/** Phần dữ liệu đợt sale cần để tính số còn lại. */
export interface SaleStockInput {
  id: string;
  mode: SaleMode;
  remainingQty: number;
  totalQty: number;
}

export interface StockView {
  /** Số còn lại theo kho mà mode của đợt sale dùng (V0 có thể âm, hiện nguyên giá trị). */
  remaining: number;
  /** false khi đợt sale V2 chưa có khóa stock:<id> trong Redis (remaining lúc đó suy từ số đơn). */
  stockLoaded: boolean;
}

/**
 * Tính remaining và stockLoaded cho từng đợt sale (D-21):
 * - v0/v1: remainingQty trong MongoDB, stockLoaded true;
 * - v2 có stock:<id>: Number(giá trị), stockLoaded true;
 * - v2 thiếu khóa: totalQty - số đơn thành công, stockLoaded false.
 * Mọi khóa v2 được đọc bằng ĐÚNG MỘT lệnh MGET; không có đợt v2 nào thì không gọi MGET
 * (MGET không khóa là lỗi của Redis, RESEARCH Pitfall 4).
 */
export async function remainingFor(redis: Redis, sales: SaleStockInput[]): Promise<Map<string, StockView>> {
  const result = new Map<string, StockView>();
  const v2: SaleStockInput[] = [];
  for (const s of sales) {
    if (s.mode === "v2") v2.push(s);
    else result.set(s.id, { remaining: s.remainingQty, stockLoaded: true });
  }
  if (v2.length === 0) return result;

  const values = await redis.mget(v2.map((s) => stockKey(s.id)));
  for (const [i, s] of v2.entries()) {
    const value = values[i];
    if (value !== null && value !== undefined) {
      result.set(s.id, { remaining: Number(value), stockLoaded: true });
    } else {
      const sold = await Order.countDocuments({ saleId: s.id, status: "success" });
      result.set(s.id, { remaining: s.totalQty - sold, stockLoaded: false });
    }
  }
  return result;
}

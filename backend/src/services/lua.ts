// Đăng ký và gọi script Lua mua hàng của V2 (D-13).
import { readFileSync } from "node:fs";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../config/redis.js";

/** Mã trả về của buy.lua: 1 thành công, 0 hết hàng, -1 đã mua, -2 chưa nạp kho. */
export type BuyScriptCode = 1 | 0 | -1 | -2;

/**
 * Đăng ký lệnh "flashBuy" trên một client Redis. Gọi lại nhiều lần không sao (defineCommand chỉ gán thuộc tính).
 * File được đọc BÊN TRONG hàm chứ không ở cấp module: file thiếu thì server.ts bắt được và in đúng một dòng [LỖI].
 * Truyền thẳng đối tượng URL cho readFileSync vì đường dẫn dự án có dấu tiếng Việt và khoảng trắng.
 * Đường dẫn tương đối "../lua/buy.lua" đúng cả với src/services (tsx) lẫn dist/services (bản build).
 */
export function registerBuyScript(redis: Redis): void {
  const lua = readFileSync(new URL("../lua/buy.lua", import.meta.url), "utf8");
  redis.defineCommand("flashBuy", { numberOfKeys: 2, lua });
}

/**
 * Chạy script mua cho một người. Chỉ nhận đúng 1, 0, -1, -2; giá trị khác là lỗi hệ thống (500).
 * Không ghi log: đây là đường mua được đo tải.
 */
export async function runBuyScript(redis: Redis, saleId: string, userId: string, qty: number): Promise<BuyScriptCode> {
  const r = await redis.flashBuy(stockKey(saleId), buyersKey(saleId), userId, String(qty));
  if (r === 1 || r === 0 || r === -1 || r === -2) return r;
  throw new Error(`Script Lua trả giá trị lạ: ${String(r)}`);
}

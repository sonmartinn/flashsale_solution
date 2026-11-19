import { User } from "./user.js";
import { Product } from "./product.js";
import { FlashSale } from "./flash-sale.js";
import { Order } from "./order.js";
import { StockMovement } from "./stock-movement.js";

export { ROLES, User, type Role } from "./user.js";
export { Product } from "./product.js";
export { FlashSale, SALE_MODES, SALE_STATUSES, type SaleMode, type SaleStatus } from "./flash-sale.js";
export { ORDER_STATUSES, Order, type OrderStatus } from "./order.js";
export { StockMovement } from "./stock-movement.js";

export const allModels = [User, Product, FlashSale, Order, StockMovement] as const;

/**
 * Tạo collection + index cho cả 5 model, lần lượt từng model; lỗi ở bất kỳ model nào thì reject.
 * connectMongo đã tắt autoIndex/autoCreate, nên đây là đường DUY NHẤT tạo index:
 * không có tác vụ ngầm nào chạy đua với dropDatabase() hay nuốt lỗi (D-21).
 */
export async function ensureIndexes(): Promise<void> {
  for (const m of allModels) {
    await m.createIndexes();
  }
}

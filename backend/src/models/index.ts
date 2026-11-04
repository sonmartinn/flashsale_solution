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

/** Tạo index cho cả 5 model (chưa cài đặt). */
export async function ensureIndexes(): Promise<void> {}

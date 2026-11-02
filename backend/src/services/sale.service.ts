import { FlashSale } from "../models/FlashSale.js";
import { Order } from "../models/Order.js";
import { StockMovement } from "../models/StockMovement.js";
import { redis, redisKeys, type SaleId } from "../config/redis.js";
import { HttpError } from "../middlewares/error.js";

export const SALE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Đưa một đợt sale về trạng thái ban đầu ở cả MongoDB và Redis.
// Mở lại thời gian bán để thí nghiệm và demo không vướng đợt sale đã hết hạn.
export async function resetSale(saleId: SaleId) {
  const sale = await FlashSale.findById(saleId);
  if (!sale) throw new HttpError(404, "Không tìm thấy đợt sale");

  const now = new Date();
  sale.remainingQty = sale.totalQty;
  sale.startAt = now;
  sale.endAt = new Date(now.getTime() + SALE_DURATION_MS);
  sale.status = "active";
  await sale.save();
  await Order.deleteMany({ saleId: sale._id });
  await StockMovement.deleteMany({ saleId: sale._id });

  await redis
    .multi()
    .set(redisKeys.stock(sale._id), sale.totalQty)
    .del(redisKeys.buyers(sale._id))
    .exec();

  return sale;
}

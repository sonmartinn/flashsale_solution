import { FlashSale } from "../models/FlashSale.js";
import { Order } from "../models/Order.js";
import { StockMovement } from "../models/StockMovement.js";
import { redis, redisKeys } from "../config/redis.js";
import { HttpError } from "../middlewares/error.js";

// Đưa một đợt sale về trạng thái ban đầu ở cả MongoDB và Redis
export async function resetSale(saleId) {
  const sale = await FlashSale.findById(saleId);
  if (!sale) throw new HttpError(404, "Không tìm thấy đợt sale");

  sale.remainingQty = sale.totalQty;
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

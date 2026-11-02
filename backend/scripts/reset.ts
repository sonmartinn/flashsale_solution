// Reset đợt sale giữa các lần thí nghiệm.
// Cách dùng: npm run reset            (mọi đợt sale)
//            npm run reset -- <saleId> (một đợt)
import { connectDb, disconnectDb } from "../src/config/db.js";
import { redis } from "../src/config/redis.js";
import { FlashSale } from "../src/models/FlashSale.js";
import { resetSale } from "../src/services/sale.service.js";

await connectDb();
await redis.connect();

const saleIds = process.argv[2]
  ? [process.argv[2]]
  : (await FlashSale.find().select("_id")).map((sale) => sale._id);
for (const saleId of saleIds) {
  const sale = await resetSale(saleId);
  console.log(`Đã reset đợt sale ${sale._id}: tồn kho ${sale.totalQty}`);
}

await redis.quit();
await disconnectDb();

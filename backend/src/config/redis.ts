import { Redis } from "ioredis";
import type { Types } from "mongoose";
import { config } from "./index.js";

export type SaleId = string | Types.ObjectId;

export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on("error", (err) => {
  console.error("[redis]", err.message);
});

export const redisKeys = {
  stock: (saleId: SaleId) => `stock:${saleId}`,
  buyers: (saleId: SaleId) => `buyers:${saleId}`,
};

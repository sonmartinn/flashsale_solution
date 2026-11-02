import { Redis } from "ioredis";
import { config } from "./index.js";

export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

redis.on("error", (err) => {
  console.error("[redis]", err.message);
});

export const redisKeys = {
  stock: (saleId) => `stock:${saleId}`,
  buyers: (saleId) => `buyers:${saleId}`,
};

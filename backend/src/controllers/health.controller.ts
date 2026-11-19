import type { RequestHandler } from "express";
import type { Redis } from "ioredis";
import type { BaseConfig } from "../config/env.js";
import { pingMongo } from "../config/db.js";
import { pingRedis } from "../config/redis.js";

/**
 * GET /api/health (D-17): 200 khi cả MongoDB và Redis đều trả lời, ngược lại 503.
 * Mỗi lần ping bị chặn 1 giây nên endpoint không bao giờ treo.
 * - testMode: chính là quyết định chế độ test (cfg.isTestMode, D-14). Script đo tải phải kiểm tra
 *   testMode === true (D-17 đã sửa) và KHÔNG BAO GIỜ suy ra chế độ test từ nodeEnv.
 * - nodeEnv: giá trị thô của NODE_ENV, chỉ để hiển thị.
 * - maxPoolSize: để script đo tải ghi vào CSV.
 */
export function createHealthController(deps: { cfg: BaseConfig; redis: Redis }): RequestHandler {
  return async (_req, res) => {
    const [mongo, redis] = await Promise.all([pingMongo(1000), pingRedis(deps.redis, 1000)]);
    res.status(mongo && redis ? 200 : 503).json({
      mongo,
      redis,
      nodeEnv: deps.cfg.nodeEnv,
      testMode: deps.cfg.isTestMode,
      maxPoolSize: deps.cfg.mongoMaxPoolSize,
    });
  };
}

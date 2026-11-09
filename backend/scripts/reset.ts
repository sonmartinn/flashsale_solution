// npm run reset -- [--sale <saleId>] [--mode v0|v1|v2] [--qty <n>]
// Reset một hoặc mọi đợt sale qua service dùng chung với route admin (D-07, D-09). --qty đặt lại cỡ kho (D-01).
// Chỉ dùng loadBaseConfig(): reset chạy được khi chưa có JWT_SECRET.

import mongoose from "mongoose";
import { ConfigError, loadBaseConfig, type BaseConfig } from "../src/config/env.js";
import { connectMongo } from "../src/config/db.js";
import { connectRedis, createRedis } from "../src/config/redis.js";
import { createSaleAdminService, type ResetResult } from "../src/services/sale-admin.service.js";
import { fail } from "../src/utils/fail.js";
import { CliArgsError, RESET_USAGE, parseResetArgs, type ResetArgs } from "./cli-args.js";

// Câu lệnh đầu tiên của script (các module import ở trên không in gì), in ở MỌI lần chạy, kể cả khi tham số sai hoặc reset thất bại (DATA-05)
console.warn(
  "[CẢNH BÁO] Lệnh này không xóa được cache đợt sale trong tiến trình backend đang chạy. Script đo tải phải reset qua API POST /api/admin/sales/:id/reset (hoặc khởi động lại backend).",
);

let args: ResetArgs;
try {
  args = parseResetArgs(process.argv.slice(2));
} catch (err) {
  if (err instanceof CliArgsError) fail(`${err.message}\n${RESET_USAGE}`);
  throw err;
}

let cfg: BaseConfig;
try {
  cfg = loadBaseConfig();
} catch (err) {
  if (err instanceof ConfigError) fail(err.message);
  throw err;
}

console.log(`Reset trên MongoDB ${cfg.mongoTarget} và Redis ${cfg.redisTarget}...`);

try {
  await connectMongo(cfg.mongoUri, cfg.mongoMaxPoolSize);
} catch {
  await mongoose.disconnect().catch(() => {});
  fail(`Không kết nối được MongoDB tại ${cfg.mongoTarget}. Chạy "docker compose up -d --wait" ở thư mục gốc.`);
}

const redis = createRedis(cfg.redisUrl);
try {
  await connectRedis(redis);
} catch {
  redis.disconnect();
  await mongoose.disconnect().catch(() => {});
  fail(`Không kết nối được Redis tại ${cfg.redisTarget}. Chạy "docker compose up -d --wait" ở thư mục gốc.`);
}

try {
  const service = createSaleAdminService({ redis });
  const opts = {
    ...(args.mode !== undefined ? { mode: args.mode } : {}),
    ...(args.qty !== undefined ? { totalQty: args.qty } : {}),
  };
  const results: ResetResult[] =
    args.saleId !== undefined ? [await service.resetSale(args.saleId, opts)] : await service.resetAllSales(opts);
  if (results.length === 0) {
    console.error("[LỖI] Không có đợt sale nào để reset. Chạy npm run seed trước.");
    process.exitCode = 1;
  }
  for (const r of results) {
    console.log(`Đã reset đợt sale ${r.saleId}: mode=${r.mode}, totalQty=${r.totalQty}, mở tới ${r.endAt.toISOString()}`);
  }
} catch (err) {
  console.error(`[LỖI] ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  // Đóng cả hai kết nối, nếu không tiến trình không tự thoát (RESEARCH Pitfall 6)
  await mongoose.disconnect().catch(() => {});
  await redis.quit().catch(() => redis.disconnect());
}

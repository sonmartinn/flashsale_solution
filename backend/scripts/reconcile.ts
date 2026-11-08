// npm run reconcile -- [--sale <saleId>] [--fix]
// Đối chiếu Redis với MongoDB cho các đợt sale mode v2 (D-26 tới D-30). MongoDB là nguồn sự thật.
// Mã thoát: 0 = mọi đợt đã khớp (hoặc không có gì để đối chiếu), 2 = còn lệch, 1 = tham số sai, không tìm thấy
// đợt sale, lỗi cấu hình hoặc kết nối. Chỉ dùng loadBaseConfig(): chạy được khi chưa có JWT_SECRET.

import mongoose from "mongoose";
import { ConfigError, loadBaseConfig, type BaseConfig } from "../src/config/env.js";
import { connectMongo } from "../src/config/db.js";
import { connectRedis, createRedis } from "../src/config/redis.js";
import { createReconcileService, type SaleCheck } from "../src/services/reconcile.service.js";
import { fail } from "../src/utils/fail.js";
import { CliArgsError, RECONCILE_USAGE, parseReconcileArgs, type ReconcileArgs } from "./cli-args.js";

// Câu lệnh đầu tiên của script, in ở MỌI lần chạy (kể cả khi tham số sai): Lua thêm buyer trước khi đơn được ghi,
// nên đối chiếu giữa lúc đang có lượt mua sẽ thấy lệch tạm thời và --fix có thể xóa nhầm buyer đó.
console.warn(
  "[LƯU Ý] Chỉ chạy đối chiếu khi không có lượt mua nào đang diễn ra (--fix ghi đè Redis theo MongoDB).",
);

/** Số id mẫu tối đa in ra cho mỗi danh sách buyer thiếu/thừa (D-28). */
const SAMPLE_IDS = 10;

let args: ReconcileArgs;
try {
  args = parseReconcileArgs(process.argv.slice(2));
} catch (err) {
  if (err instanceof CliArgsError) fail(`${err.message}\n${RECONCILE_USAGE}`);
  throw err;
}

let cfg: BaseConfig;
try {
  cfg = loadBaseConfig();
} catch (err) {
  if (err instanceof ConfigError) fail(err.message);
  throw err;
}

console.log(`Đối chiếu MongoDB ${cfg.mongoTarget} với Redis ${cfg.redisTarget}...`);

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

function sample(ids: string[]): string {
  return `[${ids.slice(0, SAMPLE_IDS).join(", ")}${ids.length > SAMPLE_IDS ? ", ..." : ""}]`;
}

function describeCheck(c: SaleCheck): string {
  if (c.inSync) {
    return (
      `Đợt sale ${c.saleId} (v2): KHỚP — stock ${c.actualStock} = ${c.totalQty} - ${c.successOrders} đơn, ` +
      `buyers ${c.successOrders}`
    );
  }
  const actual = c.actualStock === null ? "thiếu khóa" : String(c.actualStock);
  return (
    `Đợt sale ${c.saleId} (v2): LỆCH — stock thực tế ${actual}, mong đợi ${c.expectedStock}; ` +
    `buyers thiếu ${c.missingBuyers.length} ${sample(c.missingBuyers)}, ` +
    `thừa ${c.extraBuyers.length} ${sample(c.extraBuyers)}`
  );
}

try {
  const service = createReconcileService({ redis });
  const all = await service.listSales();
  const targets = args.saleId !== undefined ? all.filter((s) => s.saleId === args.saleId) : all;
  if (args.saleId !== undefined && targets.length === 0) {
    // Giả định A2 của RESEARCH: --sale với id hợp lệ nhưng không tồn tại là lỗi
    console.error(`[LỖI] Không tìm thấy đợt sale ${args.saleId}`);
    process.exitCode = 1;
  } else {
    let checked = 0;
    let drift = false;
    for (const s of targets) {
      if (s.mode !== "v2") {
        console.log(`Đợt sale ${s.saleId}: bỏ qua (mode ${s.mode})`);
        continue;
      }
      checked++;
      const check = await service.checkSale(s.saleId);
      console.log(describeCheck(check));
      if (!check.inSync) drift = true;
    }
    if (checked === 0) console.log("Không có đợt sale mode v2 nào để đối chiếu.");
    process.exitCode = drift ? 2 : 0;
  }
} catch (err) {
  console.error(`[LỖI] ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  // Đóng cả hai kết nối, nếu không tiến trình không tự thoát
  await mongoose.disconnect().catch(() => {});
  await redis.quit().catch(() => redis.disconnect());
}

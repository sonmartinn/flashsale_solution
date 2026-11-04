// npm run seed -- [--qty <n>] [--mode v0|v1|v2]
// Xóa sạch database MongoDB và db Redis trong cấu hình rồi tạo lại dữ liệu mẫu (D-06, D-08).
// Chỉ dùng loadBaseConfig(): seed chạy được khi chưa có JWT_SECRET (SPECS §7).
import mongoose from "mongoose";
import { ConfigError, loadBaseConfig, type BaseConfig } from "../src/config/env.js";
import { connectMongo } from "../src/config/db.js";
import { connectRedis, createRedis } from "../src/config/redis.js";
import { seedDatabase } from "../src/services/seed.service.js";
import { fail } from "../src/utils/fail.js";
import { CliArgsError, SEED_USAGE, parseSeedArgs, type SeedArgs } from "./cli-args.js";

// 1. Tham số sai thì dừng trước khi chạm vào bất kỳ database nào
let args: SeedArgs;
try {
  args = parseSeedArgs(process.argv.slice(2));
} catch (err) {
  if (err instanceof CliArgsError) fail(`${err.message}\n${SEED_USAGE}`);
  throw err;
}

// 2. Cấu hình (chặn cổng 27017 và URI thiếu tên database)
let cfg: BaseConfig;
try {
  cfg = loadBaseConfig();
} catch (err) {
  if (err instanceof ConfigError) fail(err.message);
  throw err;
}

console.log(`Seed vào MongoDB ${cfg.mongoTarget} và Redis ${cfg.redisTarget} (xóa sạch dữ liệu cũ)...`);

// 3. Kết nối hai kho dữ liệu
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

// 4. Seed và in phần bàn giao cho demo / script đo tải
try {
  const s = await seedDatabase({ redis, qty: args.qty, mode: args.mode });
  console.log("");
  console.log("Seed xong.");
  console.log(`  MongoDB:   ${cfg.mongoTarget}`);
  console.log(`  Redis:     ${cfg.redisTarget}`);
  console.log(`  Tài khoản: ${s.userCount} user + ${s.adminCount} admin`);
  console.log(`  Sản phẩm:  ${s.productCount}`);
  console.log(`  Đợt sale:  ${s.saleCount}`);
  console.log(`  saleId:    ${s.saleId}`);
  console.log(`  mode:      ${s.mode}`);
  console.log(`  totalQty:  ${s.totalQty}`);
  console.log(`  salePrice: ${s.salePrice} (sản phẩm ${s.productSlug})`);
  console.log(`  Mở từ ${s.startAt.toISOString()} tới ${s.endAt.toISOString()}`);
  console.log(`  Admin:     ${s.adminEmail} / mật khẩu ${s.password}`);
  console.log(`  User mẫu:  ${s.sampleUserEmail} (user0001..user${String(s.userCount).padStart(4, "0")}, cùng mật khẩu)`);
  console.log("");
  console.log("Khởi động lại backend nếu đang chạy: seed đã xóa và tạo lại dữ liệu (kể cả index).");
} catch (err) {
  console.error(`[LỖI] Seed thất bại: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  // Đóng cả hai kết nối, nếu không tiến trình không tự thoát (RESEARCH Pitfall 6)
  await mongoose.disconnect().catch(() => {});
  await redis.quit().catch(() => redis.disconnect());
}

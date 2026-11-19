import mongoose from "mongoose";
import { ConfigError, loadBaseConfig, loadJwtSecret, type BaseConfig } from "./config/env.js";
import { connectMongo } from "./config/db.js";
import { connectRedis, createRedis } from "./config/redis.js";
import { createApp } from "./app.js";
import { ensureIndexes } from "./models/index.js";
import { registerBuyScript } from "./services/lua.js";
import { fail } from "./utils/fail.js";
import { isPortFree } from "./utils/port.js";

// Trình tự khởi động: mỗi điều kiện hỏng đều thoát mã 1 với một dòng [LỖI] tiếng Việt (D-18, D-19).

function loadConfigOrFail(): { cfg: BaseConfig; jwtSecret: string } {
  try {
    return { cfg: loadBaseConfig(), jwtSecret: loadJwtSecret() };
  } catch (e) {
    if (e instanceof ConfigError) fail(e.message);
    throw e;
  }
}

const { cfg, jwtSecret } = loadConfigOrFail();

if (jwtSecret.length < 32) {
  // Chỉ cảnh báo, không từ chối; không bao giờ in giá trị của khóa
  console.warn("[CẢNH BÁO] JWT_SECRET ngắn hơn 32 ký tự. Nên dùng khóa ngẫu nhiên 32 byte (xem .env.example).");
}

// Dò cổng TRƯỚC khi kết nối MongoDB: thoát nhanh, và bắt được cả tiến trình chỉ giữ địa chỉ IPv4
if (!(await isPortFree(cfg.port))) {
  fail(`Cổng ${cfg.port} đang bị chiếm bởi tiến trình khác. Dừng tiến trình đó rồi chạy lại.`);
}

try {
  await connectMongo(cfg.mongoUri, cfg.mongoMaxPoolSize);
} catch {
  fail(`Không kết nối được MongoDB tại ${cfg.mongoTarget}. Chạy "docker compose up -d --wait" ở thư mục gốc.`);
}

// Index phải có đủ TRƯỚC khi nhận request: unique (saleId, userId) và unique email là chốt chặn dữ liệu (D-21).
try {
  await ensureIndexes();
} catch (e) {
  await mongoose.disconnect();
  fail(`Không tạo được index MongoDB: ${e instanceof Error ? e.message : String(e)}`);
}

const redis = createRedis(cfg.redisUrl);
try {
  await connectRedis(redis);
} catch {
  redis.disconnect();
  await mongoose.disconnect();
  fail(`Không kết nối được Redis tại ${cfg.redisTarget}. Chạy "docker compose up -d --wait" ở thư mục gốc.`);
}

// Đăng ký script Lua của V2 trước khi nhận request (D-13). File thiếu (build quên chép dist/lua) thì vẫn chỉ
// in đúng một dòng [LỖI] như mọi lỗi khởi động khác.
try {
  registerBuyScript(redis);
} catch (e) {
  redis.disconnect();
  await mongoose.disconnect();
  fail(`Không đọc được script Lua buy.lua: ${e instanceof Error ? e.message : String(e)}`);
}

// Hai cảnh báo dưới đây chỉ in SAU khi MongoDB và Redis đã kết nối: mọi lỗi khởi động ở trên vẫn chỉ in
// đúng một dòng [LỖI]. server.ts không đọc biến môi trường, chỉ dùng kết quả từ config/env.ts (D-14).
if (cfg.isTestMode) {
  console.warn("!!! CHẾ ĐỘ TEST: header x-test-user được chấp nhận thay cho đăng nhập. KHÔNG dùng ngoài đo tải !!!");
} else if (cfg.testModeNearMiss) {
  console.warn(
    `[CẢNH BÁO] NODE_ENV=${JSON.stringify(cfg.nodeEnv)} gần giống "test" nhưng không khớp chính xác (thừa khoảng trắng hoặc sai chữ hoa/thường): chế độ test KHÔNG bật, header x-test-user bị bỏ qua. Muốn bật chế độ test, chạy npm run start:test (lệnh này luôn đặt NODE_ENV=test, kể cả khi shell đang giữ giá trị khác).`,
  );
}

// Không truyền host: Node bind dual-stack "::" nên localhost chạy được cả với ::1 và 127.0.0.1.
// Vẫn kiểm tra lỗi trong callback (SPECS §11): phủ khoảng thời gian giữa lúc dò cổng và lúc listen.
createApp({ cfg, jwtSecret, redis }).listen(cfg.port, (error?: Error) => {
  if (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      fail(`Cổng ${cfg.port} đang bị chiếm bởi tiến trình khác. Dừng tiến trình đó rồi chạy lại.`);
    }
    fail(`Không mở được cổng ${cfg.port}: ${error.message}`);
  }
  console.log(
    `API http://localhost:${cfg.port} | MongoDB ${cfg.mongoTarget} | Redis ${cfg.redisTarget} | NODE_ENV=${JSON.stringify(cfg.nodeEnv)} | maxPoolSize=${cfg.mongoMaxPoolSize}`,
  );
});

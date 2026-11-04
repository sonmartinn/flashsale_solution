import mongoose from "mongoose";
import { ConfigError, loadBaseConfig, loadJwtSecret, type BaseConfig } from "./config/env.js";
import { connectMongo } from "./config/db.js";
import { connectRedis, createRedis } from "./config/redis.js";
import { createApp } from "./app.js";
import { fail } from "./utils/fail.js";

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

try {
  await connectMongo(cfg.mongoUri, cfg.mongoMaxPoolSize);
} catch {
  fail(`Không kết nối được MongoDB tại ${cfg.mongoTarget}. Chạy "docker compose up -d --wait" ở thư mục gốc.`);
}

const redis = createRedis(cfg.redisUrl);
try {
  await connectRedis(redis);
} catch {
  redis.disconnect();
  await mongoose.disconnect();
  fail(`Không kết nối được Redis tại ${cfg.redisTarget}. Chạy "docker compose up -d --wait" ở thư mục gốc.`);
}

if (cfg.isTestMode) {
  console.warn("!!! CHẾ ĐỘ TEST: header x-test-user được chấp nhận thay cho đăng nhập. KHÔNG dùng ngoài đo tải !!!");
}

// Không truyền host: Node bind dual-stack "::" nên localhost chạy được cả với ::1 và 127.0.0.1
createApp({ cfg, jwtSecret, redis }).listen(cfg.port, (error?: Error) => {
  if (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      fail(`Cổng ${cfg.port} đang bị chiếm bởi tiến trình khác. Dừng tiến trình đó rồi chạy lại.`);
    }
    fail(`Không mở được cổng ${cfg.port}: ${error.message}`);
  }
  console.log(
    `API http://localhost:${cfg.port} | MongoDB ${cfg.mongoTarget} | Redis ${cfg.redisTarget} | NODE_ENV=${cfg.nodeEnv} | maxPoolSize=${cfg.mongoMaxPoolSize}`,
  );
});

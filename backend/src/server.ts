import { app } from "./app.js";
import { config } from "./config/index.js";
import { connectDb } from "./config/db.js";
import { redis } from "./config/redis.js";

if (!config.jwtSecret) {
  console.error("Thiếu biến JWT_SECRET trong backend/.env, xem backend/.env.example");
  process.exit(1);
}

try {
  await connectDb();
  await redis.connect();
} catch (err) {
  console.error("Không kết nối được MongoDB/Redis. Đã chạy `docker compose up -d` chưa?");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

// Express 5 chuyển lỗi listen vào callback, không throw
app.listen(config.port, (err) => {
  if (err) {
    console.error(`Không mở được cổng ${config.port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`API chạy tại http://localhost:${config.port}/api`);
});

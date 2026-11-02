import { app } from "./app.js";
import { config } from "./config/index.js";
import { connectDb } from "./config/db.js";
import { redis } from "./config/redis.js";

try {
  await connectDb();
  await redis.connect();
} catch (err) {
  console.error("Không kết nối được MongoDB/Redis. Đã chạy `docker compose up -d` chưa?");
  console.error(err.message);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`API chạy tại http://localhost:${config.port}/api`);
});

import express, { type Express } from "express";
import cors from "cors";
import type { Redis } from "ioredis";
import type { BaseConfig } from "./config/env.js";
import { createApiRouter } from "./routes/index.js";

/** Các phụ thuộc được truyền vào app (không đọc biến môi trường, không mở kết nối ở đây). */
export interface AppDeps {
  cfg: BaseConfig;
  jwtSecret: string;
  redis: Redis;
}

/**
 * Dựng ứng dụng Express, không có I/O nào. Server và test cùng dùng hàm này.
 * Cố ý KHÔNG gắn middleware ghi log từng request: đường mua phải không có log khi đo tải.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: deps.cfg.clientOrigin }));
  app.use(express.json());
  app.use("/api", createApiRouter(deps));
  return app;
}

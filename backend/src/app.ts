import type { IncomingMessage, ServerResponse } from "node:http";
import express, { type Express } from "express";
import cors from "cors";
import type { Redis } from "ioredis";
import type { BaseConfig } from "./config/env.js";
import { createApiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middlewares/error.js";
import { HttpError } from "./utils/http-error.js";

/** Các phụ thuộc được truyền vào app (không đọc biến môi trường, không mở kết nối ở đây). */
export interface AppDeps {
  cfg: BaseConfig;
  jwtSecret: string;
  redis: Redis;
}

/**
 * Chặn body JSON rỗng (0 byte). body-parser 2.x lặng lẽ biến body JSON 0 byte thành {},
 * kể cả body chunked rỗng và body gzip của chuỗi rỗng.
 * - verify chạy với mọi request khai báo Content-Type JSON và có khung body
 *   (Content-Length hoặc Transfer-Encoding), sau khi đã giải nén, nên thấy được mọi trường hợp trên.
 * - verify bị bỏ qua khi không có Content-Type JSON, nên POST không body, không content-type
 *   vẫn tới routing với req.body undefined.
 * - HttpError giữ nguyên status 400 khi đi qua lớp bọc lỗi của body-parser, và errorHandler
 *   trả về INVALID_JSON.
 * - Không ghi log ở đây: đường mua phải không có log khi đo tải.
 */
function rejectEmptyJson(_req: IncomingMessage, _res: ServerResponse, buf: Buffer): void {
  if (buf.length === 0) {
    throw new HttpError(400, "Body JSON không hợp lệ", "INVALID_JSON");
  }
}

/**
 * Dựng ứng dụng Express, không có I/O nào. Server và test cùng dùng hàm này.
 * Cố ý KHÔNG gắn middleware ghi log từng request: đường mua phải không có log khi đo tải.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: deps.cfg.clientOrigin }));
  app.use(express.json({ verify: rejectEmptyJson }));
  app.use("/api", createApiRouter(deps));
  // Thứ tự quan trọng: notFound rồi mới tới errorHandler, không gắn gì sau errorHandler.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

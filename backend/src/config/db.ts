import mongoose from "mongoose";
import { withTimeout } from "../utils/with-timeout.js";

/**
 * Kết nối MongoDB với cấu hình tường minh:
 * - maxPoolSize lấy từ MONGO_MAX_POOL_SIZE (D-16), để ghi lại khi đo tải
 * - serverSelectionTimeoutMS 5 giây thay vì 30 giây mặc định, để khởi động hỏng thì thoát nhanh (D-19)
 * - tắt autoIndex/autoCreate: index được tạo tường minh, không chạy ngầm khi biên dịch model
 */
export async function connectMongo(uri: string, maxPoolSize: number): Promise<void> {
  await mongoose.connect(uri, {
    maxPoolSize,
    serverSelectionTimeoutMS: 5000,
    autoIndex: false,
    autoCreate: false,
  });
}

/** Ping MongoDB, không bao giờ treo quá `timeoutMs`; mọi lỗi đều trả false. */
export async function pingMongo(timeoutMs: number): Promise<boolean> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || db === undefined) return false;
  return withTimeout(
    db
      .admin()
      .ping()
      .then(() => true),
    timeoutMs,
  ).catch(() => false);
}

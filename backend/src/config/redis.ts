import { Redis } from "ioredis";
import { withTimeout } from "../utils/with-timeout.js";

const ERROR_LOG_INTERVAL_MS = 10_000;

/**
 * Tạo client Redis (chưa kết nối, lazyConnect).
 * - connectTimeout 5 giây, maxRetriesPerRequest 1: lệnh gửi khi mất kết nối bị từ chối nhanh (D-19)
 * - giữ cơ chế tự kết nối lại mặc định của ioredis: client ngừng kết nối lại thì chết luôn đến hết tiến trình
 * - luôn gắn listener "error" (ghi tối đa 1 dòng mỗi 10 giây) để không có "Unhandled error event"
 */
export function createRedis(url: string): Redis {
  const client = new Redis(url, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  let lastLoggedAt = 0;
  client.on("error", (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < ERROR_LOG_INTERVAL_MS) return;
    lastLoggedAt = now;
    console.error(`[Redis] mất kết nối: ${err.message}`);
  });
  return client;
}

/** Kết nối và PING một lần lúc khởi động; lỗi thì reject để nơi gọi thoát với thông báo rõ ràng. */
export async function connectRedis(client: Redis): Promise<void> {
  await client.connect();
  await client.ping();
}

/** Ping Redis, không bao giờ treo quá `timeoutMs`; client chưa sẵn sàng hoặc lỗi thì trả false. */
export async function pingRedis(client: Redis, timeoutMs: number): Promise<boolean> {
  if (client.status !== "ready") return false;
  return withTimeout(
    client.ping().then((r) => r === "PONG"),
    timeoutMs,
  ).catch(() => false);
}

/** Khóa tồn kho V2 của một đợt sale (SPECS §6, không có dấu ngoặc nhọn). */
export function stockKey(saleId: string): string {
  return `stock:${saleId}`;
}

/** Khóa tập người đã mua của một đợt sale (SPECS §6). */
export function buyersKey(saleId: string): string {
  return `buyers:${saleId}`;
}

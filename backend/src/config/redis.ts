import { Redis } from "ioredis";
import { withTimeout } from "../utils/with-timeout.js";

const ERROR_LOG_INTERVAL_MS = 10_000;

/**
 * Tạo client Redis (chưa kết nối, lazyConnect).
 * - connectTimeout 5 giây, maxRetriesPerRequest 1: lệnh gửi khi mất kết nối bị từ chối nhanh (D-19)
 * - giữ cơ chế tự kết nối lại mặc định của ioredis: client ngừng kết nối lại thì chết luôn đến hết tiến trình
 * - chỉ gắn một listener "error" IM LẶNG: lúc khởi động không in gì, nơi gọi in đúng một dòng [LỖI].
 *   Việc ghi log mất kết nối lúc chạy chỉ được bật trong connectRedis, sau khi kết nối thành công.
 */
export function createRedis(url: string): Redis {
  const client = new Redis(url, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  client.on("error", () => {
    // Cố ý không làm gì: client không có listener "error" thì ioredis in "[ioredis] Unhandled error event"
    // kèm stack, nên phải có listener ngay từ lúc tạo. Trong lúc khởi động listener này im lặng vì nơi gọi
    // connectRedis sẽ in đúng một dòng [LỖI] khi kết nối thất bại (G-01-2).
  });
  return client;
}

/**
 * Gắn listener ghi log mất kết nối lúc chạy: tối đa 1 dòng mỗi 10 giây, lỗi đầu tiên in ngay.
 * Chỉ gọi sau khi kết nối và PING lúc khởi động đã thành công.
 */
function attachRuntimeErrorLog(client: Redis): void {
  let lastLoggedAt = 0;
  client.on("error", (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < ERROR_LOG_INTERVAL_MS) return;
    lastLoggedAt = now;
    console.error(`[Redis] mất kết nối: ${err.message}`);
  });
}

/**
 * Kết nối và PING một lần lúc khởi động. Thành công thì bật ghi log mất kết nối lúc chạy.
 * Thất bại thì reject mà KHÔNG in gì, để nơi gọi in đúng một dòng [LỖI] rồi thoát.
 */
export async function connectRedis(client: Redis): Promise<void> {
  await client.connect();
  await client.ping();
  attachRuntimeErrorLog(client);
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

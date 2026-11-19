// Kiểm tra trước khi đo (D-06). Phép đo chỉ có giá trị khi môi trường đáng tin: backend ở chế độ test,
// MongoDB và Redis đều sống, đúng một đợt sale được chọn, index unique của orders tồn tại và dữ liệu ngay
// trước mỗi lượt đúng trạng thái vừa reset. Sai bất kỳ điều nào thì kịch bản báo INVALID (mã 2).
import type { AdminClient } from "./admin.js";
import { InvalidError, type HealthInfo, type SaleMode, type StatsSnapshot } from "./types.js";

const SALE_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Bước 1 của D-06: health 200, mongo và redis đều true, testMode === true.
 * Chỉ tin testMode, không bao giờ suy ra chế độ test từ nodeEnv (Phase 1 D-17).
 */
export function checkHealth(h: HealthInfo): void {
  const problems: string[] = [];
  if (h.httpStatus !== 200) problems.push(`GET /api/health trả về HTTP ${h.httpStatus}`);
  if (!h.mongo) problems.push("MongoDB không trả lời");
  if (!h.redis) problems.push("Redis không trả lời");
  if (h.testMode !== true) {
    problems.push("backend không chạy ở chế độ test (testMode khác true), hãy chạy `npm run start:test` trong backend/");
  }
  if (problems.length > 0) throw new InvalidError(problems.join("; "));
}

/**
 * Bước 2 của D-06 (D-03): dùng --sale nếu có, ngược lại phải có đúng một đợt sale đang mở.
 * Id luôn được kiểm tra đủ 24 hex vì nó còn đi vào đường dẫn URL và tham số của tiến trình reconcile.
 */
export async function resolveSaleId(admin: AdminClient, saleId: string | null): Promise<string> {
  if (saleId !== null) return saleId;
  const ids = await admin.activeSaleIds();
  if (ids.length !== 1) {
    throw new InvalidError(`Có ${ids.length} đợt sale đang mở, hãy truyền --sale <id>`);
  }
  const id = ids[0] as string;
  if (!SALE_ID_RE.test(id)) throw new InvalidError(`Id đợt sale "${id}" không phải ObjectId 24 hex.`);
  return id.toLowerCase();
}

/** Bước 3 của D-06 (D-07): collection orders phải có index unique { saleId: 1, userId: 1 }. */
export function checkSaleIndex(stats: StatsSnapshot): void {
  if (stats.uniqueOrderIndex !== true) {
    throw new InvalidError(
      "Collection orders không có index unique { saleId: 1, userId: 1 }: V1/V2 không được bảo vệ 1 đơn/người. " +
        "Hãy khởi động lại backend để Mongoose tạo index.",
    );
  }
}

/**
 * Bước 4 của D-06: stats ngay sau reset phải đúng trạng thái yêu cầu. Hàm thuần, trả danh sách lý do
 * (tiếng Việt); mảng rỗng nghĩa là sẵn sàng đo.
 */
export function checkPreRun(stats: StatsSnapshot, expected: { mode: SaleMode; totalQty: number }): string[] {
  const reasons: string[] = [];
  if (stats.mode !== expected.mode) reasons.push(`mode ${stats.mode} ≠ ${expected.mode}`);
  if (stats.totalQty !== expected.totalQty) reasons.push(`totalQty ${stats.totalQty} ≠ ${expected.totalQty}`);
  if (stats.mongoRemaining !== expected.totalQty) {
    reasons.push(`mongoRemaining ${stats.mongoRemaining} ≠ ${expected.totalQty}`);
  }
  if (stats.orders !== 0) reasons.push(`orders ${stats.orders} ≠ 0`);
  if (stats.redisBuyers !== 0) reasons.push(`redisBuyers ${stats.redisBuyers} ≠ 0`);
  if (expected.mode === "v2" && stats.redisStock !== expected.totalQty) {
    reasons.push(`redisStock ${stats.redisStock ?? "null"} ≠ ${expected.totalQty}`);
  }
  return reasons;
}

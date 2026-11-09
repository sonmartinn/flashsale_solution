// Kiểu dữ liệu dùng chung cho mọi kịch bản đo tải.

/** Ba cách xử lý tồn kho: V0 ngây thơ, V1 MongoDB nguyên tử, V2 Redis + Lua. */
export const SALE_MODES = ["v0", "v1", "v2"] as const;
export type SaleMode = (typeof SALE_MODES)[number];

/** Kết quả GET /api/admin/sales/:id/stats (SaleStats của backend, thêm uniqueOrderIndex từ plan 03-01). */
export interface StatsSnapshot {
  saleId: string;
  mode: SaleMode;
  status: string;
  totalQty: number;
  /** flash_sales.remainingQty, âm khi V0 bán quá */
  mongoRemaining: number;
  /** Giá trị stock:<id> trong Redis; null khi khóa không tồn tại */
  redisStock: number | null;
  /** SCARD buyers:<id> */
  redisBuyers: number;
  /** Số đơn thành công */
  orders: number;
  /** Số userId khác nhau trong các đơn thành công */
  distinctUsers: number;
  /** max(0, orders - totalQty) */
  oversold: number;
  /** Chỉ có ở v2: Redis khớp MongoDB; v0/v1 là null */
  redisInSync: boolean | null;
  /** Collection orders có index unique trên đúng { saleId: 1, userId: 1 } (D-07) */
  uniqueOrderIndex: boolean;
}

/** Thông tin rút ra từ GET /api/health để kiểm tra trước khi đo (D-06). */
export interface HealthInfo {
  httpStatus: number;
  mongo: boolean;
  redis: boolean;
  testMode: boolean;
  maxPoolSize: number | null;
}

/** Kết quả đối soát Redis/MongoDB: clean (mã 0), drift (mã 2), n/a (không chạy), invalid (mã khác). */
export type ReconcileOutcome = "clean" | "drift" | "n/a" | "invalid";

/** Trạng thái của một lượt chạy hoặc của cả thí nghiệm (D-13). */
export type RunStatus = "PASS" | "FAIL" | "INVALID";

/**
 * Phép đo không đáng tin (môi trường hỏng, server không đúng chế độ test, dữ liệu trước lượt sai...).
 * Kịch bản bắt lỗi này, ghi lại các dòng đã có, khôi phục sale rồi thoát mã 2 (D-13, D-15, D-16).
 */
export class InvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidError";
  }
}

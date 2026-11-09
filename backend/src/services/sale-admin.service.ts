// Service reset đợt sale dùng chung cho CLI (npm run reset) và route admin của Phase 2 (D-09).
// Hai nơi gọi CÙNG một hàm nên không thể lệch nhau.
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../config/redis.js";
import { FlashSale, Order, SALE_MODES, StockMovement, type SaleMode, type SaleStatus } from "../models/index.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";

const SALE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Giới hạn trên của totalQty khi reset (D-01), cùng mức với --qty của seed. */
export const MAX_TOTAL_QTY = 1_000_000;

export interface ResetResult {
  saleId: string;
  mode: SaleMode;
  totalQty: number;
  startAt: Date;
  endAt: Date;
}

export interface ResetOptions {
  /** Có thì ghi đè mode của đợt sale; không có thì giữ mode hiện tại (D-07). */
  mode?: SaleMode;
  /**
   * Có thì đặt totalQty = remainingQty = giá trị mới (số nguyên 1..MAX_TOTAL_QTY);
   * không có thì giữ totalQty hiện tại (D-01).
   */
  totalQty?: number;
}

/**
 * Số liệu một đợt sale cho admin (D-25). Script đo tải Phase 3 và trang admin Phase 4 đọc đúng các tên này.
 */
export interface SaleStats {
  saleId: string;
  mode: SaleMode;
  status: SaleStatus;
  totalQty: number;
  /** flash_sales.remainingQty (âm khi V0 bán quá) */
  mongoRemaining: number;
  /** Giá trị của stock:<id>; null khi khóa không tồn tại */
  redisStock: number | null;
  /** SCARD buyers:<id> */
  redisBuyers: number;
  /** Số đơn status "success" */
  orders: number;
  /** Số userId khác nhau trong các đơn thành công */
  distinctUsers: number;
  /** max(0, orders - totalQty) */
  oversold: number;
  /** Chỉ cho mode v2: Redis khớp số đơn (so nhanh bằng số đếm); v0/v1 là null */
  redisInSync: boolean | null;
}

export interface SaleAdminService {
  resetSale(saleId: string, opts?: ResetOptions): Promise<ResetResult>;
  resetAllSales(opts?: ResetOptions): Promise<ResetResult[]>;
  getStats(saleId: string): Promise<SaleStats>;
}

export interface SaleAdminDeps {
  redis: Redis;
  /**
   * Gọi sau mỗi lần reset thành công. Phase 1 để trống (CLI không chạm được cache của server đang chạy);
   * Phase 2 truyền saleCache.invalidate.
   */
  onSaleReset?: (saleId: string) => void;
}

/** Factory thay cho hook cấp module: CLI và route Phase 2 mỗi bên truyền seam của riêng mình. */
export function createSaleAdminService({ redis, onSaleReset = () => {} }: SaleAdminDeps): SaleAdminService {
  async function resetSale(rawSaleId: string, opts: ResetOptions = {}): Promise<ResetResult> {
    const saleId = normalizeObjectId(rawSaleId);
    if (saleId === null) throw new HttpError(400, "Mã đợt sale không hợp lệ", "INVALID_ID");
    if (opts.mode !== undefined && !SALE_MODES.includes(opts.mode)) {
      throw new HttpError(400, "mode phải là v0, v1 hoặc v2", "VALIDATION_ERROR");
    }
    // Kiểm tra lại ở service vì CLI (npm run reset -- --qty) gọi thẳng vào đây, không qua controller.
    if (
      opts.totalQty !== undefined &&
      !(Number.isSafeInteger(opts.totalQty) && opts.totalQty >= 1 && opts.totalQty <= MAX_TOTAL_QTY)
    ) {
      throw new HttpError(400, "totalQty phải là số nguyên từ 1 đến 1000000", "VALIDATION_ERROR");
    }

    const sale = await FlashSale.findById(saleId, { totalQty: 1, mode: 1 }).lean();
    if (sale === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");
    const totalQty = opts.totalQty ?? sale.totalQty;
    const mode = opts.mode ?? sale.mode;

    const now = new Date();
    const endAt = new Date(now.getTime() + SALE_DURATION_MS);

    // Đọc totalQty trước rồi $set thường (không dùng update pipeline). totalQty chỉ đổi khi
    // người gọi truyền opts.totalQty (D-01); không truyền thì giữ nguyên giá trị đang có.
    await FlashSale.updateOne(
      { _id: saleId },
      {
        $set: {
          remainingQty: totalQty,
          status: "active",
          startAt: now,
          endAt,
          ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
          ...(opts.totalQty !== undefined ? { totalQty: opts.totalQty } : {}),
        },
      },
    );
    await Order.deleteMany({ saleId });
    await StockMovement.deleteMany({ saleId });

    // exec() trả lỗi theo từng lệnh chứ không ném, và Redis không rollback lệnh đã chạy,
    // nên phải kiểm tra từng cặp [err, res]; null nghĩa là transaction bị hủy.
    const results = await redis.multi().set(stockKey(saleId), String(totalQty)).del(buyersKey(saleId)).exec();
    if (results === null) throw new Error("Redis multi() bị hủy");
    for (const [err] of results) {
      if (err) throw err;
    }

    // delta = totalQty: sau khi xóa mọi đơn của đợt, reset trả lại TOÀN BỘ kho ban đầu,
    // nên biến động duy nhất còn lại trong nhật ký là "+totalQty" (lựa chọn đã chốt ở 01-CONTEXT).
    await StockMovement.create({ saleId, orderId: null, delta: totalQty, reason: "reset", at: now });

    onSaleReset(saleId);
    return { saleId, mode, totalQty, startAt: now, endAt };
  }

  async function resetAllSales(opts: ResetOptions = {}): Promise<ResetResult[]> {
    const sales = await FlashSale.find({}, { _id: 1 }).sort({ _id: 1 }).lean();
    const results: ResetResult[] = [];
    // Lần lượt từng đợt: dừng ngay ở đợt lỗi đầu tiên, không reset song song
    for (const s of sales) {
      results.push(await resetSale(String(s._id), opts));
    }
    return results;
  }

  /**
   * Đọc số liệu một đợt sale (D-25, RESEARCH Pattern 7): năm lần đọc chạy song song trong một Promise.all.
   * redisInSync chỉ so số đếm (stock = totalQty - orders và số người trong buyers = số user có đơn);
   * so từng phần tử của tập buyers là việc của reconcile (npm run reconcile).
   */
  async function getStats(rawSaleId: string): Promise<SaleStats> {
    const saleId = normalizeObjectId(rawSaleId);
    if (saleId === null) throw new HttpError(400, "Mã đợt sale không hợp lệ", "INVALID_ID");

    const [sale, rawStock, redisBuyers, orders, users] = await Promise.all([
      FlashSale.findById(saleId, { mode: 1, status: 1, totalQty: 1, remainingQty: 1 }).lean(),
      redis.get(stockKey(saleId)),
      redis.scard(buyersKey(saleId)),
      Order.countDocuments({ saleId, status: "success" }),
      Order.distinct("userId", { saleId, status: "success" }),
    ]);
    if (sale === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");

    const redisStock = rawStock === null ? null : Number(rawStock);
    const distinctUsers = users.length;
    const redisInSync =
      sale.mode === "v2" ? redisStock === sale.totalQty - orders && redisBuyers === distinctUsers : null;

    return {
      saleId,
      mode: sale.mode,
      status: sale.status,
      totalQty: sale.totalQty,
      mongoRemaining: sale.remainingQty,
      redisStock,
      redisBuyers,
      orders,
      distinctUsers,
      oversold: Math.max(0, orders - sale.totalQty),
      redisInSync,
    };
  }

  return { resetSale, resetAllSales, getStats };
}

// Service reset đợt sale dùng chung cho CLI (npm run reset) và route admin của Phase 2 (D-09).
// Hai nơi gọi CÙNG một hàm nên không thể lệch nhau.
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../config/redis.js";
import { FlashSale, Order, SALE_MODES, StockMovement, type SaleMode } from "../models/index.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";

const SALE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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
}

export interface SaleAdminService {
  resetSale(saleId: string, opts?: ResetOptions): Promise<ResetResult>;
  resetAllSales(opts?: ResetOptions): Promise<ResetResult[]>;
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

    const sale = await FlashSale.findById(saleId, { totalQty: 1, mode: 1 }).lean();
    if (sale === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");
    const totalQty = sale.totalQty;
    const mode = opts.mode ?? sale.mode;

    const now = new Date();
    const endAt = new Date(now.getTime() + SALE_DURATION_MS);

    // Đọc totalQty trước rồi $set thường (không dùng update pipeline). totalQty không bao giờ bị đổi (D-07).
    await FlashSale.updateOne(
      { _id: saleId },
      {
        $set: {
          remainingQty: totalQty,
          status: "active",
          startAt: now,
          endAt,
          ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
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

  return { resetSale, resetAllSales };
}

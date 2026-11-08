// Cache thông tin tĩnh của đợt sale, dùng chung cho cả ba mode (D-16..D-19, BUY-02).
import { FlashSale, type SaleStatus } from "../models/index.js";

/**
 * Chỉ các trường tĩnh, ngày giờ dạng epoch ms. CỐ Ý không có tồn kho và không có mode (D-16):
 * bước kiểm tra chung không được đọc dữ liệu riêng của mode nào.
 */
export interface SaleInfo {
  productId: string;
  salePrice: number;
  totalQty: number;
  startAt: number;
  endAt: number;
  status: SaleStatus;
}

export interface SaleCache {
  get(saleId: string): Promise<SaleInfo | null>;
  /** Có saleId thì xóa một mục, không có thì xóa hết. */
  invalidate(saleId?: string): void;
}

/**
 * Tạo một cache (mỗi app đúng một lần, trong createApiRouter). Map nằm trong closure.
 * - Single-flight: promise được cất vào Map NGAY, trước mọi await, nên các request đồng thời cùng chờ một lần đọc.
 * - Không TTL (D-17): chỉ reset mới xóa mục.
 * - Không cache null và không cache lỗi (D-18). Chỉ xóa khi Map vẫn giữ đúng promise đó,
 *   để một lần đọc cũ không xóa mất mục mới hơn sau invalidate (RESEARCH Pitfall 2).
 * - get/invalidate là arrow function trong closure nên truyền làm callback (onSaleReset) không mất this.
 */
export function createSaleCache(): SaleCache {
  const entries = new Map<string, Promise<SaleInfo | null>>();

  const get = (saleId: string): Promise<SaleInfo | null> => {
    const hit = entries.get(saleId);
    if (hit !== undefined) return hit;
    const p: Promise<SaleInfo | null> = FlashSale.findById(saleId, {
      productId: 1,
      salePrice: 1,
      totalQty: 1,
      startAt: 1,
      endAt: 1,
      status: 1,
    })
      .lean()
      .then((s) =>
        s === null
          ? null
          : {
              productId: String(s.productId),
              salePrice: s.salePrice,
              totalQty: s.totalQty,
              startAt: s.startAt.getTime(),
              endAt: s.endAt.getTime(),
              status: s.status,
            },
      );
    entries.set(saleId, p);
    const evict = (): void => {
      if (entries.get(saleId) === p) entries.delete(saleId);
    };
    p.then((v) => {
      if (v === null) evict();
    }, evict);
    return p;
  };

  const invalidate = (saleId?: string): void => {
    if (saleId === undefined) entries.clear();
    else entries.delete(saleId);
  };

  return { get, invalidate };
}

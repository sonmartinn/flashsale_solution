// Service đọc cho client: sản phẩm, đợt sale (kèm số còn lại theo mode) và đơn của chính người dùng.
// Luôn đọc MongoDB mới (D-19): KHÔNG dùng cache tĩnh của đường mua, và không ghi gì cả.
import type { Redis } from "ioredis";
import { FlashSale, Product } from "../models/index.js";
import { toSaleDto, type SaleDto } from "../utils/dto.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";
import { remainingFor } from "./stock.service.js";

export interface CatalogService {
  getSale(rawId: unknown): Promise<SaleDto>;
}

/** Phần của một đợt sale (kết quả lean) mà toSaleDtos cần: các trường của SaleDto cộng remainingQty. */
type SaleRow = Parameters<typeof toSaleDto>[0] & { remainingQty: number };

export function createCatalogService({ redis }: { redis: Redis }): CatalogService {
  /**
   * Đổi một danh sách đợt sale sang SaleDto, giữ nguyên thứ tự: MỘT truy vấn sản phẩm ($in) và MỘT lần
   * remainingFor (tối đa một MGET). Sản phẩm bị thiếu là lỗi toàn vẹn dữ liệu (seed luôn tạo cả hai) -> 500.
   */
  async function toSaleDtos(sales: SaleRow[]): Promise<SaleDto[]> {
    if (sales.length === 0) return [];
    const productIds = [...new Set(sales.map((s) => String(s.productId)))];
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const stock = await remainingFor(
      redis,
      sales.map((s) => ({ id: String(s._id), mode: s.mode, remainingQty: s.remainingQty, totalQty: s.totalQty })),
    );
    return sales.map((s) => {
      const id = String(s._id);
      const product = byId.get(String(s.productId));
      if (product === undefined) throw new Error(`Đợt sale ${id} trỏ tới sản phẩm không tồn tại`);
      const view = stock.get(id);
      if (view === undefined) throw new Error(`Không tính được số còn lại của đợt sale ${id}`);
      return toSaleDto(s, product, view);
    });
  }

  async function getSale(rawId: unknown): Promise<SaleDto> {
    const id = normalizeObjectId(rawId);
    if (id === null) throw new HttpError(400, "Mã đợt sale không hợp lệ", "INVALID_ID");
    const sale = await FlashSale.findById(id).lean();
    if (sale === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");
    const [dto] = await toSaleDtos([sale]);
    if (dto === undefined) throw new Error(`Không dựng được dữ liệu đợt sale ${id}`);
    return dto;
  }

  return { getSale };
}

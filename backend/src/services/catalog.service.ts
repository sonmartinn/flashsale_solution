// Service đọc cho client: sản phẩm, đợt sale (kèm số còn lại theo mode) và đơn của chính người dùng.
// Luôn đọc MongoDB mới (D-19): KHÔNG dùng cache tĩnh của đường mua, và không ghi gì cả.
import type { Redis } from "ioredis";
import { FlashSale, Order, Product } from "../models/index.js";
import {
  toMyOrderDto,
  toProductDto,
  toSaleDto,
  type MyOrderDto,
  type ProductDto,
  type SaleDto,
} from "../utils/dto.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";
import { remainingFor } from "./stock.service.js";

/** Số đơn tối đa trả về cho /orders/me (chặn danh sách dài vô hạn). */
const MY_ORDERS_LIMIT = 100;

export interface CatalogService {
  listProducts(): Promise<ProductDto[]>;
  getProduct(rawId: unknown): Promise<ProductDto>;
  getSale(rawId: unknown): Promise<SaleDto>;
  listActiveSales(now: Date): Promise<SaleDto[]>;
  listMyOrders(userId: string): Promise<MyOrderDto[]>;
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

  /**
   * Đợt sale đang mở tại `now` (D-22): status "active" và startAt <= now <= endAt, sắp theo startAt tăng dần.
   * now do controller lấy MỘT lần mỗi request, nên danh sách và trường now của phản hồi luôn khớp nhau.
   */
  async function listActiveSales(now: Date): Promise<SaleDto[]> {
    const sales = await FlashSale.find({ status: "active", startAt: { $lte: now }, endAt: { $gte: now } })
      .sort({ startAt: 1 })
      .lean();
    return toSaleDtos(sales);
  }

  /** Toàn bộ sản phẩm theo _id tăng dần, không phân trang (bộ seed cố định 6 sản phẩm, D-20). */
  async function listProducts(): Promise<ProductDto[]> {
    const products = await Product.find().sort({ _id: 1 }).lean();
    return products.map(toProductDto);
  }

  async function getProduct(rawId: unknown): Promise<ProductDto> {
    const id = normalizeObjectId(rawId);
    if (id === null) throw new HttpError(400, "Mã sản phẩm không hợp lệ", "INVALID_ID");
    const product = await Product.findById(id).lean();
    if (product === null) throw new HttpError(404, "Không tìm thấy sản phẩm", "NOT_FOUND");
    return toProductDto(product);
  }

  /**
   * Đơn của một người dùng, mới nhất trước, tối đa MY_ORDERS_LIMIT (D-23, index (userId, createdAt -1)).
   * userId CHỈ đến từ requireAuth, không có tham số nào để xem đơn của người khác (READ-04).
   * Tóm tắt sản phẩm lấy bằng MỘT truy vấn $in, không dùng populate (populate thay productId bằng object).
   */
  async function listMyOrders(userId: string): Promise<MyOrderDto[]> {
    const orders = await Order.find({ userId }).sort({ createdAt: -1 }).limit(MY_ORDERS_LIMIT).lean();
    if (orders.length === 0) return [];
    const productIds = [...new Set(orders.map((o) => String(o.productId)))];
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    return orders.map((o) => {
      const product = byId.get(String(o.productId));
      if (product === undefined) throw new Error(`Đơn ${String(o._id)} trỏ tới sản phẩm không tồn tại`);
      return toMyOrderDto(o, product);
    });
  }

  return { getSale, listActiveSales, listProducts, getProduct, listMyOrders };
}

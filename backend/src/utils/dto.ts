// Ánh xạ tường minh document -> JSON trả cho client (D-20): id dạng chuỗi, ngày dạng ISO, không có _id / __v.
// Mọi mapper nhận kiểu CẤU TRÚC (document vừa tạo lẫn kết quả lean đều khớp) và KHÔNG bao giờ trải nguyên document.
import type { OrderStatus, SaleMode, SaleStatus } from "../models/index.js";

export interface OrderDto {
  id: string;
  saleId: string;
  productId: string;
  qty: number;
  price: number;
  status: OrderStatus;
  mode: SaleMode;
  createdAt: string;
}

/** Kiểu cấu trúc của một đơn hàng (document hoặc kết quả lean). */
interface OrderLike {
  _id: unknown;
  saleId: unknown;
  productId: unknown;
  qty: number;
  price: number;
  status: OrderStatus;
  mode: SaleMode;
  createdAt: Date;
}

/** Nhận cả document vừa tạo (Order.create) lẫn kết quả lean (findOne().lean()). */
export function toOrderDto(o: OrderLike): OrderDto {
  return {
    id: String(o._id),
    saleId: String(o.saleId),
    productId: String(o.productId),
    qty: o.qty,
    price: o.price,
    status: o.status,
    mode: o.mode,
    createdAt: o.createdAt.toISOString(),
  };
}

export interface ProductSummaryDto {
  id: string;
  name: string;
  slug: string;
  category: string;
  images: string[];
  price: number;
}

export interface ProductDto extends ProductSummaryDto {
  attributes: Record<string, unknown>;
  /** Chỉ có khi document lưu mô tả. */
  description?: string;
}

/** Kiểu cấu trúc của một sản phẩm (document hoặc kết quả lean). */
interface ProductLike {
  _id: unknown;
  name: string;
  slug: string;
  category: string;
  images: string[];
  price: number;
}

/** Tóm tắt sản phẩm đi kèm mỗi đợt sale (D-20). */
export function toProductSummaryDto(p: ProductLike): ProductSummaryDto {
  return {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    category: p.category,
    images: [...p.images],
    price: p.price,
  };
}

/** Sản phẩm đầy đủ: thêm attributes (object tự do theo loại hàng) và description nếu có. */
export function toProductDto(p: ProductLike & { attributes?: unknown; description?: string | null }): ProductDto {
  const attributes =
    typeof p.attributes === "object" && p.attributes !== null && !Array.isArray(p.attributes)
      ? (p.attributes as Record<string, unknown>)
      : {};
  const dto: ProductDto = { ...toProductSummaryDto(p), attributes };
  if (typeof p.description === "string") dto.description = p.description;
  return dto;
}

export interface SaleDto {
  id: string;
  productId: string;
  product: ProductSummaryDto;
  salePrice: number;
  totalQty: number;
  perUserLimit: number;
  startAt: string;
  endAt: string;
  status: SaleStatus;
  mode: SaleMode;
  /** Số còn lại theo kho mà mode dùng (D-21); V0 có thể âm và được hiện nguyên giá trị. */
  remaining: number;
  /** false khi đợt sale V2 chưa có stock:<id> trong Redis (remaining lúc đó suy từ số đơn). */
  stockLoaded: boolean;
}

/** Kiểu cấu trúc của một đợt sale (document hoặc kết quả lean). */
interface SaleLike {
  _id: unknown;
  productId: unknown;
  salePrice: number;
  totalQty: number;
  perUserLimit: number;
  startAt: Date;
  endAt: Date;
  status: SaleStatus;
  mode: SaleMode;
}

export function toSaleDto(
  sale: SaleLike,
  product: ProductLike,
  stock: { remaining: number; stockLoaded: boolean },
): SaleDto {
  return {
    id: String(sale._id),
    productId: String(sale.productId),
    product: toProductSummaryDto(product),
    salePrice: sale.salePrice,
    totalQty: sale.totalQty,
    perUserLimit: sale.perUserLimit,
    startAt: sale.startAt.toISOString(),
    endAt: sale.endAt.toISOString(),
    status: sale.status,
    mode: sale.mode,
    remaining: stock.remaining,
    stockLoaded: stock.stockLoaded,
  };
}

/** Đơn của chính người dùng, kèm tóm tắt sản phẩm cho trang "Đơn của tôi" (D-20, D-23). */
export type MyOrderDto = OrderDto & { product: { id: string; name: string; slug: string; images: string[] } };

export function toMyOrderDto(order: OrderLike, product: ProductLike): MyOrderDto {
  return {
    ...toOrderDto(order),
    product: { id: String(product._id), name: product.name, slug: product.slug, images: [...product.images] },
  };
}

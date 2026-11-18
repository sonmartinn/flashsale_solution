import { ApiError, requestJson } from "./api.ts";
import type { ProductDto, SaleDto } from "./types.ts";

export interface ActiveSales { now: string; sales: SaleDto[] }
export interface SaleDetail { now: string; sale: SaleDto }
export interface HomeData extends ActiveSales { products: ProductDto[] }

export function getActiveSales(signal?: AbortSignal): Promise<ActiveSales> {
  return requestJson<ActiveSales>("/sales/active", { signal });
}

export function getSale(id: string, signal?: AbortSignal): Promise<SaleDetail> {
  return requestJson<SaleDetail>(`/sales/${encodeURIComponent(id)}`, { signal });
}

export function getProducts(signal?: AbortSignal): Promise<{ products: ProductDto[] }> {
  return requestJson<{ products: ProductDto[] }>("/products", { signal });
}

export function getProduct(id: string, signal?: AbortSignal): Promise<{ product: ProductDto }> {
  return requestJson<{ product: ProductDto }>(`/products/${encodeURIComponent(id)}`, { signal });
}

export async function getHome(signal?: AbortSignal): Promise<HomeData> {
  const [sales, products] = await Promise.all([getActiveSales(signal), getProducts(signal)]);
  if (!Array.isArray(sales.sales) || typeof sales.now !== "string" || !Array.isArray(products.products)) {
    throw new ApiError(200, "Máy chủ trả danh sách không hợp lệ.", "INVALID_RESPONSE");
  }
  return { ...sales, products: products.products };
}

export const currency = (value: number): string =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);

const labels: Record<string, string> = {
  sizes: "Kích cỡ", size: "Kích cỡ", colors: "Màu sắc", color: "Màu sắc",
  material: "Chất liệu", fit: "Dáng quần", length: "Chiều dài", pattern: "Họa tiết",
  heelHeight: "Chiều cao gót", sole: "Đế giày", capacity: "Sức chứa", dimensions: "Kích thước",
  waterproof: "Chống nước", hood: "Mũ áo", weight: "Khối lượng", strap: "Quai túi",
  waistSizes: "Cỡ vòng eo", euSizes: "Cỡ giày EU", soleMaterial: "Chất liệu đế",
  upperMaterial: "Chất liệu thân", dimensionsCm: "Kích thước (cm)", capacityLiters: "Dung tích (lít)",
  w: "Rộng", h: "Cao", d: "Sâu",
};

/** Chỉ hiển thị thuộc tính được API cung cấp; không suy thuộc tính từ ảnh đại diện. */
export function productAttributes(attributes: Record<string, unknown>): [string, string][] {
  const text = (value: unknown): string => {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "Có" : "Không";
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
    if (typeof value === "object" && value !== null) {
      return Object.entries(value).map(([key, item]) => `${labels[key] ?? key}: ${text(item)}`).join("; ");
    }
    return "";
  };
  return Object.entries(attributes).map(([key, value]): [string, string] => [labels[key] ?? key, text(value)])
    .filter(([, value]) => value !== "");
}

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
  description?: string;
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
  status: "scheduled" | "active" | "ended";
  mode: "v0" | "v1" | "v2";
  remaining: number;
  stockLoaded: boolean;
}

export interface OrderDto {
  id: string;
  saleId: string;
  productId: string;
  qty: number;
  price: number;
  status: "success" | "cancelled";
  mode: "v0" | "v1" | "v2";
  createdAt: string;
}

export type MyOrderDto = OrderDto & {
  product: { id: string; name: string; slug: string; images: string[] };
};

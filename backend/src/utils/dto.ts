// Ánh xạ tường minh document -> JSON trả cho client (D-20): id dạng chuỗi, ngày dạng ISO, không có _id / __v.
import type { OrderStatus, SaleMode } from "../models/index.js";

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

/** Nhận cả document vừa tạo (Order.create) lẫn kết quả lean (findOne().lean()). */
export function toOrderDto(o: {
  _id: unknown;
  saleId: unknown;
  productId: unknown;
  qty: number;
  price: number;
  status: OrderStatus;
  mode: SaleMode;
  createdAt: Date;
}): OrderDto {
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

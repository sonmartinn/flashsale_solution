// Hàm tạo đơn DUY NHẤT, cả ba mode V0/V1/V2 đều đi qua đây (D-15, BUY-08).
import mongoose from "mongoose";
import { Order, type SaleMode } from "../models/index.js";
import { toOrderDto, type OrderDto } from "../utils/dto.js";

export interface CreateOrderInput {
  saleId: string;
  userId: string;
  productId: string;
  price: number;
  qty: number;
  mode: SaleMode;
}

export type CreateOrderFn = (input: CreateOrderInput) => Promise<OrderDto>;

/**
 * Ghi một đơn thành công. Index unique (saleId, userId) là chốt chặn cuối: đơn trùng ném E11000,
 * nơi gọi tự bắt và đổi thành ALREADY_BOUGHT. Không ghi log, không ghi stock_movements (đường mua được đo tải).
 */
export const createOrder: CreateOrderFn = async ({ saleId, userId, productId, price, qty, mode }) => {
  const doc = await Order.create({ userId, saleId, productId, qty, price, status: "success", mode });
  return toOrderDto(doc);
};

/** Lỗi trùng khóa unique của MongoDB (cùng phép thử với middlewares/error.ts). */
export function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof mongoose.mongo.MongoServerError && err.code === 11000;
}

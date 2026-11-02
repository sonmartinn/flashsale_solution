import { HttpError } from "../middlewares/error.js";
import type { BuyMode } from "../models/FlashSale.js";

export interface BuyInput {
  saleId: string;
  // Chưa bắt buộc vì controller chưa có userId từ auth
  userId?: string;
  qty: number;
}

type BuyHandler = (input: BuyInput) => Promise<unknown>;

// V0: findOne đọc tồn kho rồi updateOne với $inc (cố tình không nguyên tử để chứng minh lỗi)
const buyV0: BuyHandler = async () => {
  throw new HttpError(501, "Chưa cài đặt V0 (dự kiến tuần 2)");
};

// V1: findOneAndUpdate có điều kiện remainingQty >= qty
const buyV1: BuyHandler = async () => {
  throw new HttpError(501, "Chưa cài đặt V1 (dự kiến tuần 2)");
};

// V2: chạy src/lua/buy.lua rồi ghi đơn vào MongoDB, lỗi thì hoàn kho Redis
const buyV2: BuyHandler = async () => {
  throw new HttpError(501, "Chưa cài đặt V2 (dự kiến tuần 3)");
};

export const buyHandlers: Record<BuyMode, BuyHandler> = { v0: buyV0, v1: buyV1, v2: buyV2 };

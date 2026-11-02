import { HttpError } from "../middlewares/error.js";

// V0: đọc tồn kho rồi ghi lại (cố tình không nguyên tử để chứng minh lỗi)
async function buyV0() {
  throw new HttpError(501, "Chưa cài đặt V0 (dự kiến tuần 2)");
}

// V1: findOneAndUpdate có điều kiện remainingQty >= qty
async function buyV1() {
  throw new HttpError(501, "Chưa cài đặt V1 (dự kiến tuần 2)");
}

// V2: chạy src/lua/buy.lua rồi ghi đơn vào MongoDB, lỗi thì hoàn kho Redis
async function buyV2() {
  throw new HttpError(501, "Chưa cài đặt V2 (dự kiến tuần 3)");
}

export const buyHandlers = { v0: buyV0, v1: buyV1, v2: buyV2 };

import { Schema, model } from "mongoose";

// Nhật ký biến động kho. reason là chuỗi tự do (không enum): Phase 1 ghi "reset",
// Phase 2 thêm các lý do bù trừ mà không phải đổi schema.
const stockMovementSchema = new Schema(
  {
    saleId: { type: Schema.Types.ObjectId, ref: "FlashSale", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    delta: { type: Number, required: true },
    reason: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
  },
  // Đặt tên collection tường minh, nếu không Mongoose tự đổi thành "stockmovements"
  { collection: "stock_movements" },
);

stockMovementSchema.index({ saleId: 1, at: 1 });

export const StockMovement = model("StockMovement", stockMovementSchema);

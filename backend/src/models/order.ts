import { Schema, model } from "mongoose";
import { SALE_MODES } from "./flash-sale.js";

export const ORDER_STATUSES = ["success", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    saleId: { type: Schema.Types.ObjectId, ref: "FlashSale", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, default: "success" },
    mode: { type: String, enum: SALE_MODES, required: true },
  },
  { collection: "orders", timestamps: { createdAt: true, updatedAt: false } },
);

// Unique (saleId, userId): mỗi người tối đa 1 đơn mỗi sale, là chốt chặn cuối của V1/V2.
orderSchema.index({ saleId: 1, userId: 1 }, { unique: true });
// Danh sách đơn của một user, mới nhất trước.
orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = model("Order", orderSchema);

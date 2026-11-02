import mongoose from "mongoose";
import { BUY_MODES } from "./FlashSale.js";

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "FlashSale", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["success", "cancelled"], default: "success" },
    mode: { type: String, enum: BUY_MODES, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Giới hạn mỗi người một đơn trong một đợt sale
orderSchema.index({ saleId: 1, userId: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = mongoose.model("Order", orderSchema);

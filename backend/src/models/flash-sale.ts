import { Schema, model } from "mongoose";

export const SALE_MODES = ["v0", "v1", "v2"] as const;
export type SaleMode = (typeof SALE_MODES)[number];

export const SALE_STATUSES = ["scheduled", "active", "ended"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

const flashSaleSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    salePrice: { type: Number, required: true },
    totalQty: { type: Number, required: true, min: 1 },
    // CỐ Ý không có min và không chặn số âm: V0 phải làm được remainingQty âm để thí nghiệm
    // chứng minh việc bán quá (SPECS §6).
    remainingQty: { type: Number, required: true },
    perUserLimit: { type: Number, required: true, default: 1 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: SALE_STATUSES, required: true },
    mode: { type: String, enum: SALE_MODES, required: true },
  },
  // Đặt tên collection tường minh, nếu không Mongoose tự đổi thành "flashsales"
  { collection: "flash_sales" },
);

flashSaleSchema.index({ status: 1, startAt: 1 });

export const FlashSale = model("FlashSale", flashSaleSchema);

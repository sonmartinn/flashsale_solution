import mongoose from "mongoose";

export const BUY_MODES = ["v0", "v1", "v2"] as const;

export type BuyMode = (typeof BUY_MODES)[number];

export function isBuyMode(value: unknown): value is BuyMode {
  return BUY_MODES.includes(value as BuyMode);
}

const flashSaleSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    salePrice: { type: Number, required: true, min: 0 },
    totalQty: { type: Number, required: true, min: 0 },
    // Tồn kho dùng cho V0/V1; V2 dùng key stock:<saleId> trong Redis
    remainingQty: { type: Number, required: true },
    perUserLimit: { type: Number, default: 1, min: 1 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: ["scheduled", "active", "ended"], default: "scheduled" },
    mode: { type: String, enum: BUY_MODES, default: "v2" },
  },
  { collection: "flash_sales" }
);

flashSaleSchema.index({ status: 1, startAt: 1 });

export const FlashSale = mongoose.model("FlashSale", flashSaleSchema);

import mongoose from "mongoose";

const stockMovementSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "FlashSale", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    delta: { type: Number, required: true },
    reason: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { collection: "stock_movements" }
);

stockMovementSchema.index({ saleId: 1, at: 1 });

export const StockMovement = mongoose.model("StockMovement", stockMovementSchema);

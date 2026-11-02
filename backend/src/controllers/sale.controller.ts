import type { Request, Response } from "express";
import { FlashSale, BUY_MODES, isBuyMode } from "../models/FlashSale.js";
import { HttpError } from "../middlewares/error.js";
import { buyHandlers } from "../services/purchase.service.js";

export async function listActiveSales(req: Request, res: Response) {
  const sales = await FlashSale.find({ status: "active" }).populate("productId");
  res.json(sales);
}

export async function getSale(req: Request<{ id: string }>, res: Response) {
  const sale = await FlashSale.findById(req.params.id).populate("productId");
  if (!sale) throw new HttpError(404, "Không tìm thấy đợt sale");
  res.json(sale);
}

export async function buy(req: Request<{ id: string }>, res: Response) {
  const { mode } = req.query;
  if (!isBuyMode(mode)) {
    throw new HttpError(400, `mode phải là một trong: ${BUY_MODES.join(", ")}`);
  }
  const result = await buyHandlers[mode]({ saleId: req.params.id, qty: req.body?.qty ?? 1 });
  res.status(201).json(result);
}

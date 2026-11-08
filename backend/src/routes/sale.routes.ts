import { Router } from "express";
import { createSaleController } from "../controllers/sale.controller.js";
import type { AuthMiddleware } from "../middlewares/auth.js";
import type { PurchaseService } from "../services/purchase.service.js";

/** Router /api/sales: POST /:id/buy (cần đăng nhập). */
export function createSaleRouter(deps: { auth: AuthMiddleware; purchase: PurchaseService }): Router {
  const controller = createSaleController({ purchase: deps.purchase });
  const router = Router();
  router.post("/:id/buy", deps.auth.requireAuth, controller.buy);
  return router;
}

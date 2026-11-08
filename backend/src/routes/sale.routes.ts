import { Router } from "express";
import { createSaleController } from "../controllers/sale.controller.js";
import type { AuthMiddleware } from "../middlewares/auth.js";
import type { CatalogService } from "../services/catalog.service.js";
import type { PurchaseService } from "../services/purchase.service.js";

/** Router /api/sales: GET /:id (công khai) và POST /:id/buy (cần đăng nhập). */
export function createSaleRouter(deps: {
  auth: AuthMiddleware;
  purchase: PurchaseService;
  catalog: CatalogService;
}): Router {
  const controller = createSaleController({ purchase: deps.purchase, catalog: deps.catalog });
  const router = Router();
  // GET /active PHẢI đăng ký trước GET /:id, nếu không "/active" bị /:id bắt và trả 400 INVALID_ID.
  router.get("/:id", controller.getById);
  router.post("/:id/buy", deps.auth.requireAuth, controller.buy);
  return router;
}

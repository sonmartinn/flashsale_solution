import { Router } from "express";
import { createOrderController } from "../controllers/order.controller.js";
import type { AuthMiddleware } from "../middlewares/auth.js";
import type { CatalogService } from "../services/catalog.service.js";

/** Router /api/orders: GET /me (cần đăng nhập; JWT, hoặc x-test-user ở chế độ test). */
export function createOrderRouter(deps: { auth: AuthMiddleware; catalog: CatalogService }): Router {
  const controller = createOrderController({ catalog: deps.catalog });
  const router = Router();
  router.get("/me", deps.auth.requireAuth, controller.listMine);
  return router;
}

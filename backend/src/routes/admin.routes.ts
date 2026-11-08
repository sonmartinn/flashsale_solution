import { Router } from "express";
import { createAdminController } from "../controllers/admin.controller.js";
import type { AuthMiddleware } from "../middlewares/auth.js";
import type { SaleAdminService } from "../services/sale-admin.service.js";

/**
 * Router /api/admin. Guard đặt bằng router.use TRƯỚC mọi route, nên mọi đường dẫn /api/admin/*
 * (kể cả đường dẫn không tồn tại) đều phải qua requireAuth rồi requireAdmin (AUTH-04).
 * - POST /sales/:id/reset: reset đợt sale, body tùy chọn { mode } (D-24)
 * - GET /sales/:id/stats: số liệu Mongo/Redis/đơn của đợt sale (D-25)
 */
export function createAdminRouter(auth: AuthMiddleware, deps: { saleAdmin: SaleAdminService }): Router {
  const router = Router();
  router.use(auth.requireAuth, auth.requireAdmin);
  const controller = createAdminController({ saleAdmin: deps.saleAdmin });
  router.post("/sales/:id/reset", controller.resetSale);
  router.get("/sales/:id/stats", controller.getStats);
  return router;
}

import { Router } from "express";
import type { AuthMiddleware } from "../middlewares/auth.js";

/**
 * Router /api/admin. Guard đặt bằng router.use TRƯỚC mọi route, nên mọi đường dẫn /api/admin/*
 * (kể cả đường dẫn không tồn tại) đều phải qua requireAuth rồi requireAdmin (AUTH-04).
 * Phase 2 thêm /sales/:id/reset và /sales/:id/stats vào đây.
 */
export function createAdminRouter(auth: AuthMiddleware): Router {
  const router = Router();
  router.use(auth.requireAuth, auth.requireAdmin);
  return router;
}

import { Router } from "express";
import type { AppDeps } from "../app.js";
import { createHealthController } from "../controllers/health.controller.js";
import { createAuthMiddleware } from "../middlewares/auth.js";
import { createPurchaseService } from "../services/purchase.service.js";
import { createSaleAdminService } from "../services/sale-admin.service.js";
import { createSaleCache } from "../services/sale-cache.js";
import { createAdminRouter } from "./admin.routes.js";
import { createAuthRouter } from "./auth.routes.js";
import { createSaleRouter } from "./sale.routes.js";

/** Router gốc của API, được gắn tại /api. */
export function createApiRouter(deps: AppDeps): Router {
  const router = Router();
  // Dựng một lần, dùng chung cho mọi route cần đăng nhập (Phase 2: buy, orders, admin).
  const auth = createAuthMiddleware(deps);
  // Đúng MỘT cache tĩnh cho mỗi app, ba mode cùng đọc qua nó (D-16). Reset phải gọi saleCache.invalidate.
  const saleCache = createSaleCache();
  const purchase = createPurchaseService({ redis: deps.redis, saleCache });
  // Reset qua API dùng CÙNG service với npm run reset (D-09) và xóa CÙNG cache mà purchase đọc (BUY-02, D-17).
  const saleAdmin = createSaleAdminService({ redis: deps.redis, onSaleReset: saleCache.invalidate });
  router.get("/health", createHealthController(deps));
  router.use("/auth", createAuthRouter(deps));
  router.use("/sales", createSaleRouter({ auth, purchase }));
  router.use("/admin", createAdminRouter(auth, { saleAdmin }));
  return router;
}

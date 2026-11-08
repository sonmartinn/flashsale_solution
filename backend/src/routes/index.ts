import { Router } from "express";
import type { AppDeps } from "../app.js";
import { createHealthController } from "../controllers/health.controller.js";
import { createAuthMiddleware } from "../middlewares/auth.js";
import { createCatalogService } from "../services/catalog.service.js";
import { createPurchaseService } from "../services/purchase.service.js";
import { createSaleAdminService } from "../services/sale-admin.service.js";
import { createSaleCache } from "../services/sale-cache.js";
import { createAdminRouter } from "./admin.routes.js";
import { createAuthRouter } from "./auth.routes.js";
import { createOrderRouter } from "./order.routes.js";
import { createProductRouter } from "./product.routes.js";
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
  // Đường đọc (sản phẩm, đợt sale, đơn của tôi) đọc MongoDB mới, không qua saleCache (D-19).
  const catalog = createCatalogService({ redis: deps.redis });
  router.get("/health", createHealthController(deps));
  router.use("/auth", createAuthRouter(deps));
  router.use("/products", createProductRouter({ catalog }));
  router.use("/sales", createSaleRouter({ auth, purchase, catalog }));
  router.use("/orders", createOrderRouter({ auth, catalog }));
  router.use("/admin", createAdminRouter(auth, { saleAdmin }));
  return router;
}

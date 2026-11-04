import { Router } from "express";
import type { AppDeps } from "../app.js";
import { createHealthController } from "../controllers/health.controller.js";
import { createAuthMiddleware } from "../middlewares/auth.js";
import { createAdminRouter } from "./admin.routes.js";
import { createAuthRouter } from "./auth.routes.js";

/** Router gốc của API, được gắn tại /api. */
export function createApiRouter(deps: AppDeps): Router {
  const router = Router();
  // Dựng một lần, dùng chung cho mọi route cần đăng nhập (Phase 2: buy, orders, admin).
  const auth = createAuthMiddleware(deps);
  router.get("/health", createHealthController(deps));
  router.use("/auth", createAuthRouter(deps));
  router.use("/admin", createAdminRouter(auth));
  return router;
}

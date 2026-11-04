import { Router } from "express";
import type { AppDeps } from "../app.js";
import { createHealthController } from "../controllers/health.controller.js";

/** Router gốc của API, được gắn tại /api. */
export function createApiRouter(deps: AppDeps): Router {
  const router = Router();
  router.get("/health", createHealthController(deps));
  return router;
}

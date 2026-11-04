import { Router } from "express";
import type { AppDeps } from "../app.js";
import { createAuthController } from "../controllers/auth.controller.js";
import { createAuthService } from "../services/auth.service.js";

/** Router /api/auth: POST /register (201) và POST /login (200), cùng trả { token, user }. */
export function createAuthRouter(deps: Pick<AppDeps, "jwtSecret">): Router {
  const controller = createAuthController(createAuthService({ jwtSecret: deps.jwtSecret }));
  const router = Router();
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  return router;
}

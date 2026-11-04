import type { RequestHandler } from "express";
import type { BaseConfig } from "../config/env.js";

export interface AuthMiddleware {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
}

// Khung tạm cho bước RED: chưa xác minh gì, chỉ cho đi qua.
export function createAuthMiddleware(_deps: { cfg: BaseConfig; jwtSecret: string }): AuthMiddleware {
  const requireAuth: RequestHandler = (_req, _res, next) => {
    next();
  };
  const requireAdmin: RequestHandler = (_req, _res, next) => {
    next();
  };
  return { requireAuth, requireAdmin };
}

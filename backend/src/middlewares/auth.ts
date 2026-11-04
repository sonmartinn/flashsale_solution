import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { BaseConfig } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";

export interface AuthMiddleware {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
}

const BEARER_RE = /^Bearer ([^\s]+)$/;

function invalidToken(): HttpError {
  return new HttpError(401, "Token không hợp lệ", "UNAUTHORIZED");
}

/**
 * Tạo requireAuth / requireAdmin (D-13, D-14, SPECS mục 7).
 * - requireAuth chỉ xác minh token, KHÔNG tra MongoDB (không thêm lần đọc nào vào đường mua).
 * - Hai middleware đều đồng bộ, không giữ trạng thái dùng chung giữa các request.
 */
export function createAuthMiddleware(deps: { cfg: BaseConfig; jwtSecret: string }): AuthMiddleware {
  const { cfg, jwtSecret } = deps;

  const requireAuth: RequestHandler = (req, _res, next) => {
    // Chế độ test (bắn tải): dùng cờ isTestMode duy nhất tính trong config/env.ts.
    // Có header x-test-user thì header thắng; danh tính này luôn chỉ mang quyền user.
    if (cfg.isTestMode) {
      const header = req.get("x-test-user");
      if (header !== undefined) {
        const id = normalizeObjectId(header);
        if (id === null) throw new HttpError(401, "x-test-user không phải ObjectId hợp lệ", "UNAUTHORIZED");
        req.user = { id, role: "user" };
        next();
        return;
      }
    }

    const match = BEARER_RE.exec(req.get("authorization") ?? "");
    const token = match?.[1];
    if (token === undefined) throw new HttpError(401, "Bạn chưa đăng nhập", "UNAUTHORIZED");

    let payload: string | jwt.JwtPayload;
    try {
      // Ghim HS256: token alg "none" hay thuật toán khác đều bị từ chối.
      payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    } catch (err) {
      // try/catch cục bộ chỉ để dịch lỗi của jsonwebtoken sang HttpError.
      if (err instanceof jwt.TokenExpiredError) {
        throw new HttpError(401, "Phiên đăng nhập đã hết hạn", "UNAUTHORIZED");
      }
      throw invalidToken();
    }

    if (typeof payload !== "object") throw invalidToken();
    const id = normalizeObjectId(payload.sub);
    const role: unknown = payload["role"];
    if (id === null || (role !== "user" && role !== "admin")) throw invalidToken();

    req.user = { id, role };
    next();
  };

  const requireAdmin: RequestHandler = (req, _res, next) => {
    if (req.user === undefined) throw new HttpError(401, "Bạn chưa đăng nhập", "UNAUTHORIZED");
    if (req.user.role !== "admin") throw new HttpError(403, "Bạn không có quyền truy cập", "FORBIDDEN");
    next();
  };

  return { requireAuth, requireAdmin };
}

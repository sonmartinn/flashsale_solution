import type { Role } from "../models/user.js";

// requireAuth gắn danh tính đã xác minh vào req.user (không tra MongoDB).
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export {};

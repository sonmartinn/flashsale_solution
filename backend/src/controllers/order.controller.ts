import type { RequestHandler } from "express";
import type { CatalogService } from "../services/catalog.service.js";
import { HttpError } from "../utils/http-error.js";

/** Handler đơn hàng của người đang đăng nhập. Express 5 tự chuyển lỗi async tới middleware lỗi. */
export function createOrderController(deps: { catalog: CatalogService }): { listMine: RequestHandler } {
  const { catalog } = deps;
  /** GET /api/orders/me -> { orders }: chỉ đơn của req.user.id, mới nhất trước, tối đa 100 (D-23). */
  const listMine: RequestHandler = async (req, res) => {
    // requireAuth đã chạy trên route; vẫn kiểm tra để không bao giờ đọc đơn khi thiếu danh tính
    const user = req.user;
    if (user === undefined) throw new HttpError(401, "Bạn chưa đăng nhập", "UNAUTHORIZED");
    res.json({ orders: await catalog.listMyOrders(user.id) });
  };
  return { listMine };
}

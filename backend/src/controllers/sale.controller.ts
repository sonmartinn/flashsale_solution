import type { RequestHandler } from "express";
import { SALE_MODES } from "../models/index.js";
import type { CatalogService } from "../services/catalog.service.js";
import type { BuyResult, PurchaseService } from "../services/purchase.service.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";

/**
 * Bảng DUY NHẤT đổi kết quả nghiệp vụ không thành công sang HTTP (D-06). Cả ba mode dùng chung bảng này,
 * nên cùng một tình huống luôn ra cùng một mã.
 */
const FAILURES: Record<Exclude<BuyResult["kind"], "ok">, HttpError> = {
  sold_out: new HttpError(409, "Sản phẩm trong đợt sale đã hết hàng", "SOLD_OUT"),
  already_bought: new HttpError(409, "Bạn đã mua sản phẩm này trong đợt sale", "ALREADY_BOUGHT"),
  not_loaded: new HttpError(503, "Kho của đợt sale chưa được nạp vào Redis", "STOCK_NOT_LOADED"),
};

/**
 * POST /api/sales/:id/buy?mode=v0|v1|v2, body { "qty": 1 }.
 * Thứ tự kiểm tra (D-01), dừng ở lỗi đầu tiên, mọi kiểm tra chạy TRƯỚC khi chạm kho:
 * 401 chưa đăng nhập -> 400 INVALID_MODE -> 400 VALIDATION_ERROR (qty) -> 400 INVALID_ID
 * -> (service) 404 NOT_FOUND -> 400 SALE_NOT_ACTIVE -> bước trừ kho của mode.
 * Express 5 tự chuyển lỗi async tới middleware lỗi, không cần try/catch.
 */
export function createSaleController(deps: { purchase: PurchaseService; catalog: CatalogService }): {
  buy: RequestHandler;
  getById: RequestHandler;
  getActive: RequestHandler;
} {
  const { purchase, catalog } = deps;

  /** GET /api/sales/active -> { now, sales }: cùng một now dùng để lọc và để trả về (D-22). */
  const getActive: RequestHandler = async (_req, res) => {
    const now = new Date();
    const sales = await catalog.listActiveSales(now);
    res.json({ now: now.toISOString(), sales });
  };

  /**
   * GET /api/sales/:id -> { now, sale } (D-20, D-21, D-22). Trả cả đợt sale đã kết thúc.
   * now lấy MỘT lần mỗi request để giao diện chỉnh đồng hồ đếm ngược theo giờ server.
   */
  const getById: RequestHandler = async (req, res) => {
    const now = new Date();
    const sale = await catalog.getSale(req.params["id"]);
    res.json({ now: now.toISOString(), sale });
  };

  const buy: RequestHandler = async (req, res) => {
    // requireAuth đã chạy trên route; vẫn kiểm tra để không bao giờ mua mà không có danh tính
    const user = req.user;
    if (user === undefined) throw new HttpError(401, "Bạn chưa đăng nhập", "UNAUTHORIZED");

    // Chỉ nhận đúng một chuỗi v0/v1/v2: mảng (?mode=a&mode=b) hay object (?mode[$ne]=x) đều bị từ chối.
    // Không có mode thì báo lỗi, KHÔNG lấy mode của đợt sale (D-02, D-03).
    const rawMode: unknown = req.query["mode"];
    const mode = typeof rawMode === "string" ? SALE_MODES.find((m) => m === rawMode) : undefined;
    if (mode === undefined) throw new HttpError(400, "Chế độ mua phải là v0, v1 hoặc v2", "INVALID_MODE");

    // Body phải là object (không phải mảng) và qty phải đúng là SỐ 1 (D-04): "1", 1.5, -5, 0, 2, {"$gt":0} đều sai.
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body) || (body as { qty?: unknown }).qty !== 1) {
      throw new HttpError(400, "Số lượng mua phải đúng bằng 1", "VALIDATION_ERROR");
    }

    const saleId = normalizeObjectId(req.params["id"]);
    if (saleId === null) throw new HttpError(400, "Mã đợt sale không hợp lệ", "INVALID_ID");

    const result = await purchase.buy({ saleId, userId: user.id, mode, qty: 1 });
    if (result.kind === "ok") {
      res.status(201).json({ order: result.order });
      return;
    }
    throw FAILURES[result.kind];
  };

  return { buy, getById, getActive };
}

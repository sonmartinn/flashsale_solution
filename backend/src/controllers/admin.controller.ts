import type { RequestHandler } from "express";
import { SALE_MODES, type SaleMode } from "../models/index.js";
import { MAX_TOTAL_QTY, type ResetResult, type SaleAdminService } from "../services/sale-admin.service.js";
import { HttpError } from "../utils/http-error.js";

/** DTO của kết quả reset: liệt kê tường minh từng trường, ngày giờ dạng chuỗi ISO (D-24). */
function toResetDto(r: ResetResult): {
  saleId: string;
  mode: SaleMode;
  totalQty: number;
  startAt: string;
  endAt: string;
} {
  return {
    saleId: r.saleId,
    mode: r.mode,
    totalQty: r.totalQty,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
  };
}

/**
 * Kiểu của Express 5 cho phép tham số đường dẫn là mảng (route wildcard). Chỉ chuyển tiếp chuỗi;
 * giá trị khác thành chuỗi rỗng để service trả 400 INVALID_ID.
 */
function paramId(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * Handler của /api/admin (đã qua requireAuth + requireAdmin ở router).
 * Express 5 tự chuyển lỗi async tới middleware lỗi, không cần try/catch.
 */
export function createAdminController(deps: { saleAdmin: SaleAdminService }): {
  resetSale: RequestHandler;
  getStats: RequestHandler;
} {
  const { saleAdmin } = deps;

  /**
   * POST /api/admin/sales/:id/reset, body tùy chọn { "mode"?: "v0" | "v1" | "v2", "totalQty"?: số nguyên 1..1000000 }
   * (D-24, D-01). Không có mode thì giữ mode hiện tại của đợt sale (Phase 1 D-07), không bao giờ xóa mode;
   * không có totalQty thì giữ totalQty hiện tại.
   */
  const resetSale: RequestHandler = async (req, res) => {
    // Express 5: request không có body thì req.body là undefined, coi như object rỗng
    const body: unknown = req.body ?? {};
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new HttpError(400, "Body phải là một object JSON", "VALIDATION_ERROR");
    }

    // Chỉ đọc đúng trường mode. Kiểm tra ở đây, TRƯỚC service, để mode sai luôn ra INVALID_MODE
    // (service sẽ trả VALIDATION_ERROR, RESEARCH Pitfall 5). null, số, mảng, "V2" đều bị từ chối.
    const raw: unknown = (body as { mode?: unknown }).mode;
    let mode: SaleMode | undefined;
    if (raw !== undefined) {
      mode = typeof raw === "string" ? SALE_MODES.find((m) => m === raw) : undefined;
      if (mode === undefined) throw new HttpError(400, "Chế độ phải là v0, v1 hoặc v2", "INVALID_MODE");
    }

    // totalQty kiểm tra SAU mode (mode sai vẫn ra INVALID_MODE). Chỉ nhận đúng kiểu number, không ép kiểu:
    // "100", true, null, mảng, object toán tử kiểu {"$gt":0} và số không an toàn đều bị từ chối (D-01).
    const rawQty: unknown = (body as { totalQty?: unknown }).totalQty;
    let totalQty: number | undefined;
    if (rawQty !== undefined) {
      if (typeof rawQty !== "number" || !Number.isSafeInteger(rawQty) || rawQty < 1 || rawQty > MAX_TOTAL_QTY) {
        throw new HttpError(400, "totalQty phải là số nguyên từ 1 đến 1000000", "VALIDATION_ERROR");
      }
      totalQty = rawQty;
    }

    // Service tự chuẩn hóa id: 400 INVALID_ID, 404 NOT_FOUND; reset xong thì gọi onSaleReset (xóa cache).
    const result = await saleAdmin.resetSale(paramId(req.params["id"]), {
      ...(mode !== undefined ? { mode } : {}),
      ...(totalQty !== undefined ? { totalQty } : {}),
    });
    res.json({ sale: toResetDto(result) });
  };

  /**
   * GET /api/admin/sales/:id/stats -> 200 { stats } với mười hai trường: mười một trường của D-25 cộng uniqueOrderIndex
   * (Phase 3 D-07). 400 INVALID_ID, 404 NOT_FOUND.
   */
  const getStats: RequestHandler = async (req, res) => {
    res.json({ stats: await saleAdmin.getStats(paramId(req.params["id"])) });
  };

  return { resetSale, getStats };
}

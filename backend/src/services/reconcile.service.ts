// Service đối chiếu Redis với MongoDB cho các đợt sale V2 (D-26 tới D-31).
// MongoDB là nguồn sự thật: stock:<id> phải bằng totalQty - số đơn thành công, và buyers:<id> phải đúng
// tập userId của các đơn thành công. Service KHÔNG in gì: CLI scripts/reconcile.ts lo phần hiển thị,
// còn test gọi thẳng service trong cùng tiến trình (D-31).
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../config/redis.js";
import { FlashSale, Order, StockMovement, type SaleMode } from "../models/index.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeObjectId } from "../utils/object-id.js";

export interface SaleCheck {
  saleId: string;
  mode: SaleMode;
  totalQty: number;
  /** Số đơn status "success" của đợt trong MongoDB */
  successOrders: number;
  /** totalQty - successOrders */
  expectedStock: number;
  /** Giá trị của stock:<id>; null khi khóa không tồn tại (thiếu khóa cũng là lệch, D-28) */
  actualStock: number | null;
  /** userId có đơn thành công nhưng không nằm trong buyers:<id> (đã sắp xếp) */
  missingBuyers: string[];
  /** Thành viên của buyers:<id> không có đơn thành công nào (đã sắp xếp) */
  extraBuyers: string[];
  inSync: boolean;
}

export interface SaleFixResult {
  before: SaleCheck;
  /** Kết quả kiểm tra lại sau khi sửa */
  after: SaleCheck;
  /** stock:<id> trước khi sửa; 0 khi khóa không tồn tại (D-29) */
  oldStock: number;
  /** stock:<id> sau khi sửa = totalQty - số đơn thành công */
  newStock: number;
}

export interface ReconcileService {
  /** Mọi đợt sale (mọi mode), sắp theo _id; CLI tự quyết định bỏ qua đợt nào. */
  listSales(): Promise<{ saleId: string; mode: SaleMode }[]>;
  /** So Redis với MongoDB cho một đợt sale; chạy được với mọi mode. */
  checkSale(saleId: string): Promise<SaleCheck>;
  /**
   * Ghi đè Redis theo MongoDB (D-29): SET stock, DEL buyers, SADD buyers trong MỘT multi(), rồi ghi một biến động
   * reconcile_fix và kiểm tra lại. KHÔNG BAO GIỜ ghi vào orders hay flash_sales: MongoDB là nguồn sự thật.
   */
  fixSale(saleId: string): Promise<SaleFixResult>;
}

export interface ReconcileDeps {
  redis: Redis;
}

/** Dữ liệu gốc lấy từ MongoDB cho một đợt sale. */
interface SaleTruth {
  saleId: string;
  mode: SaleMode;
  totalQty: number;
  successOrders: number;
  /** userId (hex chữ thường) của các đơn thành công */
  userIds: string[];
}

export function createReconcileService({ redis }: ReconcileDeps): ReconcileService {
  async function listSales(): Promise<{ saleId: string; mode: SaleMode }[]> {
    const sales = await FlashSale.find({}, { _id: 1, mode: 1 }).sort({ _id: 1 }).lean();
    return sales.map((s) => ({ saleId: String(s._id), mode: s.mode }));
  }

  async function loadTruth(rawSaleId: string): Promise<SaleTruth> {
    const saleId = normalizeObjectId(rawSaleId);
    if (saleId === null) throw new HttpError(400, "Mã đợt sale không hợp lệ", "INVALID_ID");
    const sale = await FlashSale.findById(saleId, { totalQty: 1, mode: 1 }).lean();
    if (sale === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");
    const filter = { saleId, status: "success" as const };
    const [successOrders, rawUserIds] = await Promise.all([
      Order.countDocuments(filter),
      Order.distinct("userId", filter),
    ]);
    return {
      saleId,
      mode: sale.mode,
      totalQty: sale.totalQty,
      successOrders,
      userIds: rawUserIds.map((u) => String(u).toLowerCase()),
    };
  }

  async function compare(truth: SaleTruth): Promise<SaleCheck> {
    const [rawStock, members] = await Promise.all([
      redis.get(stockKey(truth.saleId)),
      redis.smembers(buyersKey(truth.saleId)),
    ]);
    const expectedStock = truth.totalQty - truth.successOrders;
    const actualStock = rawStock === null ? null : Number(rawStock);
    const inRedis = new Set(members);
    const inOrders = new Set(truth.userIds);
    const missingBuyers = truth.userIds.filter((u) => !inRedis.has(u)).sort();
    const extraBuyers = members.filter((m) => !inOrders.has(m)).sort();
    return {
      saleId: truth.saleId,
      mode: truth.mode,
      totalQty: truth.totalQty,
      successOrders: truth.successOrders,
      expectedStock,
      actualStock,
      missingBuyers,
      extraBuyers,
      inSync: actualStock === expectedStock && missingBuyers.length === 0 && extraBuyers.length === 0,
    };
  }

  async function checkSale(rawSaleId: string): Promise<SaleCheck> {
    return compare(await loadTruth(rawSaleId));
  }

  async function fixSale(rawSaleId: string): Promise<SaleFixResult> {
    // Đọc MongoDB một lần: cùng danh sách userId dùng cho cả kiểm tra và SADD
    const truth = await loadTruth(rawSaleId);
    const before = await compare(truth);
    const saleId = truth.saleId;
    const oldStock = before.actualStock !== null && Number.isFinite(before.actualStock) ? before.actualStock : 0;
    const newStock = before.expectedStock;

    const tx = redis.multi().set(stockKey(saleId), String(newStock)).del(buyersKey(saleId));
    // SADD với mảng (không spread); không có đơn nào thì bỏ qua vì SADD không nhận danh sách rỗng
    if (truth.userIds.length > 0) tx.sadd(buyersKey(saleId), truth.userIds);
    // exec() trả lỗi theo từng lệnh chứ không ném, và Redis không rollback lệnh đã chạy,
    // nên phải kiểm tra từng cặp [err, res]; null nghĩa là transaction bị hủy.
    const results = await tx.exec();
    if (results === null) throw new Error("Redis multi() bị hủy");
    for (const [err] of results) {
      if (err) throw err;
    }

    // Chỉ ghi nhật ký sau khi multi() thành công trọn vẹn
    await StockMovement.create({
      saleId,
      orderId: null,
      delta: newStock - oldStock,
      reason: "reconcile_fix",
      at: new Date(),
    });

    const after = await checkSale(saleId);
    return { before, after, oldStock, newStock };
  }

  return { listSales, checkSale, fixSale };
}

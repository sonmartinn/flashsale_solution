// Đường mua dùng chung cho ba mode (D-14, SPECS §8). Ba mode CHỈ khác nhau ở bước trừ kho:
// cùng cache tĩnh, cùng bước kiểm tra cửa sổ thời gian, cùng hàm createOrder, cùng bộ kết quả.
// Đường thành công không ghi log, không ghi stock_movements, không đọc thêm gì ngoài các lần đọc liệt kê
// dưới đây (BUY-08). Log và stock_movements chỉ xuất hiện ở nhánh bù trừ của V1/V2 khi ghi đơn thất bại.
import type { Redis } from "ioredis";
import { stockKey } from "../config/redis.js";
import { FlashSale, StockMovement, type SaleMode } from "../models/index.js";
import type { OrderDto } from "../utils/dto.js";
import { HttpError } from "../utils/http-error.js";
import { runBuyScript } from "./lua.js";
import {
  createOrder as defaultCreateOrder,
  isDuplicateKeyError,
  type CreateOrderFn,
  type CreateOrderInput,
} from "./order.service.js";
import type { SaleCache } from "./sale-cache.js";

/** Kết quả nghiệp vụ; controller đổi sang HTTP ở MỘT bảng duy nhất (D-06). */
export type BuyResult =
  | { kind: "ok"; order: OrderDto }
  | { kind: "sold_out" }
  | { kind: "already_bought" }
  | { kind: "not_loaded" };

export interface BuyInput {
  saleId: string;
  userId: string;
  mode: SaleMode;
  qty: number;
}

export interface PurchaseService {
  buy(input: BuyInput): Promise<BuyResult>;
}

export interface PurchaseDeps {
  redis: Redis;
  saleCache: SaleCache;
  /** Mặc định là createOrder dùng chung; test truyền hàm khác để giả lập lỗi ghi đơn. */
  createOrder?: CreateOrderFn;
}

type BuyHandler = (input: CreateOrderInput) => Promise<BuyResult>;

/** Hai mode có bù trừ kho; V0 cố ý không có (D-09). */
type CompensatedMode = "v1" | "v2";

/** reason của dòng stock_movements sau một lần hoàn kho thành công (D-12). */
const COMPENSATE_REASON: Record<CompensatedMode, string> = {
  v1: "compensate_v1",
  v2: "compensate_v2",
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createPurchaseService({
  redis,
  saleCache,
  createOrder = defaultCreateOrder,
}: PurchaseDeps): PurchaseService {
  /** Ghi đơn cho V0; trùng khóa unique (saleId, userId) thì là ALREADY_BOUGHT (D-08), lỗi khác ném tiếp. */
  async function insertOrder(input: CreateOrderInput): Promise<BuyResult> {
    try {
      return { kind: "ok", order: await createOrder(input) };
    } catch (e) {
      if (isDuplicateKeyError(e)) return { kind: "already_bought" };
      throw e;
    }
  }

  /** Ghi đơn cho V1/V2: kho đã bị trừ trước đó, nên lỗi ghi đơn đi qua compensate (D-10..D-12). */
  async function insertOrderOrCompensate(mode: CompensatedMode, input: CreateOrderInput): Promise<BuyResult> {
    try {
      return { kind: "ok", order: await createOrder(input) };
    } catch (e) {
      return compensate(mode, e, input);
    }
  }

  /** Trả lại phần kho đã trừ. V1: $inc trên flash_sales. V2: chỉ INCRBY, người mua vẫn ở trong buyers (D-11). */
  async function refundStock(mode: CompensatedMode, { saleId, qty }: CreateOrderInput): Promise<void> {
    if (mode === "v1") {
      await FlashSale.updateOne({ _id: saleId }, { $inc: { remainingQty: qty } });
    } else {
      await redis.incrby(stockKey(saleId), qty);
    }
  }

  /**
   * Ghi MỘT dòng nhật ký sau khi hoàn kho thành công (D-12). Lỗi ghi chỉ in một dòng và bị nuốt:
   * không chặn việc hoàn kho đã xong, không đổi kết quả trả cho client.
   */
  async function recordCompensation(mode: CompensatedMode, { saleId, userId, qty }: CreateOrderInput): Promise<void> {
    try {
      await StockMovement.create({ saleId, orderId: null, delta: qty, reason: COMPENSATE_REASON[mode], at: new Date() });
    } catch (e) {
      console.error(
        `[Bù trừ] Không ghi được stock_movements saleId=${saleId} userId=${userId} mode=${mode}: ${errorMessage(e)}`,
      );
    }
  }

  /**
   * Hoàn kho thất bại (D-12, sửa đổi 2026-11-08): in một dòng có saleId, userId, mode rồi trả về lỗi MỚI
   * mang lỗi ghi đơn gốc trong cause. errorHandler trả 500 INTERNAL_ERROR, không bao giờ 409 DUPLICATE.
   */
  function refundFailure(
    mode: CompensatedMode,
    { saleId, userId }: CreateOrderInput,
    cause: unknown,
    refundErr: unknown,
    message: string,
  ): Error {
    console.error(`[Bù trừ] Hoàn kho thất bại saleId=${saleId} userId=${userId} mode=${mode}: ${errorMessage(refundErr)}`);
    return new Error(message, { cause });
  }

  /**
   * Bù trừ khi ghi đơn lỗi SAU khi đã trừ kho (V1/V2).
   * E11000: người này thật sự đã có đơn, nên chỉ trả kho rồi báo ALREADY_BOUGHT (D-08, D-11).
   */
  async function compensate(mode: CompensatedMode, err: unknown, input: CreateOrderInput): Promise<BuyResult> {
    if (isDuplicateKeyError(err)) {
      try {
        await refundStock(mode, input);
      } catch (refundErr) {
        throw refundFailure(mode, input, err, refundErr, "Hoàn kho thất bại sau lỗi trùng đơn");
      }
      await recordCompensation(mode, input);
      return { kind: "already_bought" };
    }
    throw err;
  }

  const buyHandlers: Record<SaleMode, BuyHandler> = {
    // V0: CỐ Ý ngây thơ (BUY-04). Đọc rồi mới trừ, giữa hai bước có khe để các request chen vào nên bán quá.
    // Trừ bằng $inc chứ không ghi giá trị tính sẵn (SPECS §8). Đơn trùng: không hoàn kho (D-09).
    v0: async (input) => {
      const s = await FlashSale.findOne({ _id: input.saleId }, { remainingQty: 1 }).lean();
      // Sale bị xóa sau khi đã vào cache
      if (s === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");
      if (s.remainingQty < input.qty) return { kind: "sold_out" };
      await FlashSale.updateOne({ _id: input.saleId }, { $inc: { remainingQty: -input.qty } });
      return insertOrder(input);
    },

    // V1: kiểm tra và trừ trong MỘT lệnh nguyên tử trên một document (BUY-05).
    // Không truyền tùy chọn đòi document sau cập nhật: Mongoose 9 sẽ in cảnh báo deprecated ở mỗi lần gọi.
    // Ghi đơn lỗi sau khi đã trừ thì hoàn kho theo D-10..D-12 (compensate).
    v1: async (input) => {
      const dec = await FlashSale.findOneAndUpdate(
        { _id: input.saleId, remainingQty: { $gte: input.qty } },
        { $inc: { remainingQty: -input.qty } },
        { projection: { _id: 1 }, lean: true },
      );
      if (dec === null) return { kind: "sold_out" };
      return insertOrderOrCompensate("v1", input);
    },

    // V2: script Lua nguyên tử trên Redis (BUY-06). Không bao giờ chạm flash_sales.
    v2: async (input) => {
      const code = await runBuyScript(redis, input.saleId, input.userId, input.qty);
      if (code === -1) return { kind: "already_bought" };
      if (code === 0) return { kind: "sold_out" };
      if (code === -2) return { kind: "not_loaded" };
      return insertOrderOrCompensate("v2", input);
    },
  };

  async function buy({ saleId, userId, mode, qty }: BuyInput): Promise<BuyResult> {
    const sale = await saleCache.get(saleId);
    if (sale === null) throw new HttpError(404, "Không tìm thấy đợt sale", "NOT_FOUND");

    // Một lần Date.now() cho cả hai phép so sánh (D-05)
    const now = Date.now();
    if (sale.status === "ended" || now > sale.endAt) {
      throw new HttpError(400, "Đợt sale đã kết thúc", "SALE_NOT_ACTIVE");
    }
    if (sale.status !== "active" || now < sale.startAt) {
      throw new HttpError(400, "Đợt sale chưa bắt đầu", "SALE_NOT_ACTIVE");
    }

    return buyHandlers[mode]({ saleId, userId, productId: sale.productId, price: sale.salePrice, qty, mode });
  }

  return { buy };
}

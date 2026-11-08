// Đường mua dùng chung cho ba mode (D-14, SPECS §8). Ba mode CHỈ khác nhau ở bước trừ kho:
// cùng cache tĩnh, cùng bước kiểm tra cửa sổ thời gian, cùng hàm createOrder, cùng bộ kết quả.
// Không ghi log, không ghi stock_movements, không đọc thêm gì ngoài các lần đọc liệt kê dưới đây (BUY-08).
import type { Redis } from "ioredis";
import { FlashSale, type SaleMode } from "../models/index.js";
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

export function createPurchaseService({
  redis,
  saleCache,
  createOrder = defaultCreateOrder,
}: PurchaseDeps): PurchaseService {
  /** Ghi đơn; trùng khóa unique (saleId, userId) thì là ALREADY_BOUGHT (D-08), lỗi khác ném tiếp. */
  async function insertOrder(input: CreateOrderInput): Promise<BuyResult> {
    try {
      return { kind: "ok", order: await createOrder(input) };
    } catch (e) {
      if (isDuplicateKeyError(e)) return { kind: "already_bought" };
      throw e;
    }
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
    // Plan 02-03 thêm việc hoàn kho (D-10..D-12) vào nhánh lỗi của insertOrder.
    v1: async (input) => {
      const dec = await FlashSale.findOneAndUpdate(
        { _id: input.saleId, remainingQty: { $gte: input.qty } },
        { $inc: { remainingQty: -input.qty } },
        { projection: { _id: 1 }, lean: true },
      );
      if (dec === null) return { kind: "sold_out" };
      return insertOrder(input);
    },

    // V2: script Lua nguyên tử trên Redis (BUY-06). Không bao giờ chạm flash_sales.
    v2: async (input) => {
      const code = await runBuyScript(redis, input.saleId, input.userId, input.qty);
      if (code === -1) return { kind: "already_bought" };
      if (code === 0) return { kind: "sold_out" };
      if (code === -2) return { kind: "not_loaded" };
      return insertOrder(input);
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

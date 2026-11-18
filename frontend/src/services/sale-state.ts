import type { SaleDto } from "./types.ts";

export interface ServerClock { epoch: number; monotonic: number }
export function synchronizeClock(now: string, monotonic: number): ServerClock {
  const epoch = Date.parse(now);
  if (!Number.isFinite(epoch) || !Number.isFinite(monotonic)) throw new Error("Giờ máy chủ không hợp lệ.");
  return { epoch, monotonic };
}
export const serverTime = (clock: ServerClock, monotonic: number): number => clock.epoch + Math.max(0, monotonic - clock.monotonic);
export const remainingSeconds = (endAt: string, now: number): number => Math.max(0, Math.ceil((Date.parse(endAt) - now) / 1000) || 0);

export function buyUnavailable(sale: SaleDto, now: number, state: { pending?: boolean; stale?: boolean; purchased?: boolean; checking?: boolean } = {}): string {
  if (state.purchased) return "Bạn đã mua sản phẩm trong đợt sale này.";
  if (state.pending) return "Đang gửi yêu cầu mua…";
  if (state.stale || !Number.isFinite(now)) return "Cần đọc lại dữ liệu trước khi mua.";
  const start = Date.parse(sale.startAt), end = Date.parse(sale.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || sale.status !== "active" || now < start || now >= end) return "Đợt sale chưa mở hoặc đã kết thúc.";
  if (!sale.stockLoaded) return "Kho chưa sẵn sàng.";
  if (sale.remaining <= 0) return "Sản phẩm đã hết hàng.";
  if (state.checking) return PURCHASE_COPY.checking;
  return "";
}

/** Khóa trước lần await đầu tiên, kể cả hai click trong cùng một lượt render. */
export function createSingleFlight() {
  let busy = false;
  return {
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try { return await action(); } finally { busy = false; }
    },
  };
}

/** Nhãn tồn kho: giữ đúng remaining của API (âm ở V0 vẫn hiện), kho chưa nạp luôn thắng số suy ra. */
export function stockLabel(sale: Pick<SaleDto, "remaining" | "stockLoaded">): { text: string; negative: boolean } {
  if (!sale.stockLoaded) return { text: "Kho chưa sẵn sàng", negative: false };
  if (sale.remaining < 0) return { text: `Tồn kho âm: ${sale.remaining} sản phẩm (đã bán vượt)`, negative: true };
  return { text: `Còn ${sale.remaining} sản phẩm`, negative: false };
}

/** Mỗi lần reset đặt lại startAt (và có thể đổi mode), nên bộ ba này nhận ra một lượt mới của cùng đợt sale. */
export const saleEpoch = (sale: Pick<SaleDto, "id" | "startAt" | "mode">): string => `${sale.id}|${sale.startAt}|${sale.mode}`;

export type PurchaseKind =
  | "success" | "sold-out" | "already-bought" | "not-active" | "stock-not-loaded"
  | "not-found" | "rejected" | "unauthorized" | "uncertain";

export const PURCHASE_COPY = {
  soldOut: "Sản phẩm đã hết hàng. Chọn Sản phẩm để xem các mặt hàng khác.",
  alreadyBought: "Bạn đã mua sản phẩm trong đợt sale này.",
  notActive: "Đợt sale chưa mở hoặc đã kết thúc. Chọn Flash Sale để xem đợt sale đang mở trên trang chủ.",
  stockNotLoaded: "Kho chưa sẵn sàng.",
  notFound: "Không tìm thấy đợt sale.",
  expired: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  uncertain: "Chưa xác nhận được kết quả mua. Kiểm tra đơn của bạn trước khi mua lại.",
  confirmed: (orderId: string) => `Đơn của bạn đã được ghi nhận. Mã đơn ${orderId}.`,
  cleared: "Chưa thấy đơn của bạn trong đợt sale này. Bạn có thể bấm Mua ngay nếu vẫn muốn mua.",
  checking: "Đang kiểm tra đơn của bạn…",
  success: (orderId: string) => `Mua thành công. Mã đơn ${orderId}.`,
} as const;

interface ErrorLike { status?: unknown; code?: unknown; message?: unknown }

/**
 * Phân loại lỗi của MỘT lần POST mua. Chỉ mã nghiệp vụ 4xx và 503 STOCK_NOT_LOADED là kết quả chắc chắn
 * (không có đơn mới). 5xx khác, lỗi mạng hay 2xx hỏng đều "chưa rõ": không tự gửi lại.
 */
export function classifyPurchaseError(error: unknown): { kind: Exclude<PurchaseKind, "success">; message: string } {
  const value = error && typeof error === "object" ? error as ErrorLike : {};
  const status = typeof value.status === "number" ? value.status : 0;
  const code = typeof value.code === "string" ? value.code : "";
  if (status === 401 && code === "UNAUTHORIZED") return { kind: "unauthorized", message: PURCHASE_COPY.expired };
  if (status === 409 && code === "SOLD_OUT") return { kind: "sold-out", message: PURCHASE_COPY.soldOut };
  if (status === 409 && code === "ALREADY_BOUGHT") return { kind: "already-bought", message: PURCHASE_COPY.alreadyBought };
  if (status === 400 && code === "SALE_NOT_ACTIVE") return { kind: "not-active", message: PURCHASE_COPY.notActive };
  if (status === 503 && code === "STOCK_NOT_LOADED") return { kind: "stock-not-loaded", message: PURCHASE_COPY.stockNotLoaded };
  if (status === 404 && code === "NOT_FOUND") return { kind: "not-found", message: PURCHASE_COPY.notFound };
  if (status >= 400 && status < 500) {
    return { kind: "rejected", message: typeof value.message === "string" && value.message ? value.message : "Yêu cầu mua không hợp lệ." };
  }
  return { kind: "uncertain", message: PURCHASE_COPY.uncertain };
}

/** Kết quả POST mua, gắn với phiên/lượt sale đã gửi; seq so thứ tự với các lần đọc đơn. */
export interface PurchaseRecord { generation: number; epoch: string; seq: number; kind: PurchaseKind; message: string; orderId?: string }
/** Một lần đọc /orders/me thành công cho phiên/lượt sale; seq lấy lúc BẮT ĐẦU đọc. */
export interface MembershipRecord { generation: number; epoch: string; seq: number; orderId?: string }

export interface PurchaseView {
  /** Đã biết phiên này có đơn thành công trong lượt sale hiện tại. */
  bought: boolean;
  /** Khóa mua cho tới khi một lần đọc đơn bắt đầu sau lỗi xác nhận trạng thái (kết quả chưa rõ). */
  locked: boolean;
  kind?: PurchaseKind | "confirmed" | "cleared";
  message: string;
  orderId?: string;
}

/**
 * Phiên đã đăng nhập nhưng chưa có lần đọc đơn nào thành công (và chưa báo lỗi) cho đúng phiên + lượt sale:
 * nút mua chờ, kể cả khung hình đầu tiên trước khi lần đọc kịp bắt đầu.
 */
export function awaitingMembership(current: { generation: number; epoch: string; signedIn: boolean }, membership?: { generation: number; epoch: string }, failed?: { generation: number; epoch: string }): boolean {
  const same = (record?: { generation: number; epoch: string }) => record?.generation === current.generation && record.epoch === current.epoch;
  return current.signedIn && !same(membership) && !same(failed);
}

/**
 * Gộp kết quả mua và lần đọc đơn gần nhất cho đúng phiên + lượt sale đang hiển thị.
 * Dữ liệu của phiên cũ hoặc của lượt trước reset bị bỏ qua; không có cờ "đã mua" lưu lâu dài.
 */
export function resolvePurchase(current: { generation: number; epoch: string }, purchase?: PurchaseRecord, membership?: MembershipRecord): PurchaseView {
  const same = (record?: { generation: number; epoch: string }) => record?.generation === current.generation && record.epoch === current.epoch;
  const result = same(purchase) ? purchase : undefined;
  const known = same(membership) ? membership : undefined;
  if (result?.kind === "success") return { bought: true, locked: false, kind: "success", message: result.message, orderId: result.orderId };
  if (known?.orderId) {
    if (result?.kind === "uncertain" && known.seq > result.seq) {
      return { bought: true, locked: false, kind: "confirmed", message: PURCHASE_COPY.confirmed(known.orderId), orderId: known.orderId };
    }
    return { bought: true, locked: false, kind: "already-bought", message: PURCHASE_COPY.alreadyBought, orderId: known.orderId };
  }
  if (result?.kind === "uncertain") {
    if (known && known.seq > result.seq) return { bought: false, locked: false, kind: "cleared", message: PURCHASE_COPY.cleared };
    return { bought: false, locked: true, kind: "uncertain", message: result.message };
  }
  if (result?.kind === "already-bought") return { bought: true, locked: false, kind: "already-bought", message: result.message };
  if (result) return { bought: false, locked: false, kind: result.kind, message: result.message };
  return { bought: false, locked: false, message: "" };
}

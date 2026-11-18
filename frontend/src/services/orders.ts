import { ApiError } from "./api.ts";
import type { SessionStore } from "./auth.ts";
import type { MyOrderDto } from "./types.ts";

/** Giới hạn của GET /api/orders/me (backend MY_ORDERS_LIMIT); client không tự phân trang. */
export const MY_ORDERS_LIMIT = 100;

const statuses = new Set(["success", "cancelled"]);
const modes = new Set(["v0", "v1", "v2"]);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Chỉ nhận đúng DTO đơn kèm tóm tắt sản phẩm do API trả; không tự ghép sản phẩm từ nơi khác. */
export function parseMyOrder(value: unknown): MyOrderDto | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Record<string, unknown>;
  const product = order.product as Record<string, unknown> | null | undefined;
  if (!isText(order.id) || !isText(order.saleId) || !isText(order.productId) || !isText(order.createdAt)
    || typeof order.price !== "number" || !Number.isFinite(order.price) || typeof order.qty !== "number"
    || typeof order.status !== "string" || !statuses.has(order.status)
    || typeof order.mode !== "string" || !modes.has(order.mode)
    || !Number.isFinite(Date.parse(order.createdAt))
    || !product || typeof product !== "object" || !isText(product.id) || !isText(product.name)
    || typeof product.slug !== "string" || !Array.isArray(product.images)
    || !product.images.every(image => typeof image === "string")) return null;
  return {
    id: order.id, saleId: order.saleId, productId: order.productId, qty: order.qty, price: order.price,
    status: order.status as MyOrderDto["status"], mode: order.mode as MyOrderDto["mode"], createdAt: order.createdAt,
    product: { id: product.id, name: product.name, slug: product.slug, images: [...product.images as string[]] },
  };
}

/**
 * Đơn của đúng phiên đang đăng nhập, mới nhất trước như API trả.
 * store.request gắn Bearer hiện tại và ném StaleSessionError nếu phiên đổi trong lúc chờ.
 */
export async function listMyOrders(store: Pick<SessionStore, "request">, signal?: AbortSignal): Promise<MyOrderDto[]> {
  const payload = await store.request<unknown>("/orders/me", { signal });
  const list = payload && typeof payload === "object" ? (payload as Record<string, unknown>).orders : undefined;
  if (!Array.isArray(list)) throw new ApiError(200, "Máy chủ trả danh sách đơn không hợp lệ.", "INVALID_RESPONSE");
  const orders = list.map(parseMyOrder);
  if (orders.some(order => order === null)) throw new ApiError(200, "Máy chủ trả danh sách đơn không hợp lệ.", "INVALID_RESPONSE");
  return orders as MyOrderDto[];
}

/** Đơn thành công của đợt sale này, nếu có. Reset xóa đơn của đợt nên đọc lại sau reset trả về undefined. */
export function findSaleOrder(orders: readonly MyOrderDto[], saleId: string): MyOrderDto | undefined {
  return orders.find(order => order.saleId === saleId && order.status === "success");
}

export const orderStatusLabel = (status: MyOrderDto["status"]): string => status === "success" ? "Thành công" : "Đã hủy";

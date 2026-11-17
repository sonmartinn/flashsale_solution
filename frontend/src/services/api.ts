export interface ProductSummaryDto {
  id: string;
  name: string;
  slug: string;
  category: string;
  images: string[];
  price: number;
}

export interface ProductDto extends ProductSummaryDto {
  attributes: Record<string, unknown>;
  description?: string;
}

export interface SaleDto {
  id: string;
  productId: string;
  product: ProductSummaryDto;
  salePrice: number;
  totalQty: number;
  perUserLimit: number;
  startAt: string;
  endAt: string;
  status: "scheduled" | "active" | "ended";
  mode: "v0" | "v1" | "v2";
  remaining: number;
  stockLoaded: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = "UNKNOWN_ERROR") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface JsonOptions extends Omit<RequestInit, "body"> { body?: unknown }

/** Một lần gọi, không tự gửi lại mutation; chỉ khai báo JSON khi thực sự có body. */
export async function requestJson<T>(path: string, options: JsonOptions = {}): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) {
    throw new Error("Đường dẫn API phải là đường dẫn nội bộ.");
  }
  const { body, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, {
    ...init, headers, cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const value = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    throw new ApiError(response.status,
      typeof value.message === "string" ? value.message : "Không đọc được dữ liệu. Vui lòng thử lại.",
      typeof value.code === "string" ? value.code : "UNKNOWN_ERROR");
  }
  if (payload === null) throw new ApiError(response.status, "Máy chủ trả dữ liệu không hợp lệ.", "INVALID_RESPONSE");
  return payload as T;
}

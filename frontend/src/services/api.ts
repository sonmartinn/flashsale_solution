export type { ProductSummaryDto, ProductDto, SaleDto } from "./types.ts";

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
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f#]/.test(path)) {
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
  const payload: unknown = await response.json().catch((cause: unknown) => {
    if (init.signal?.aborted) throw cause;
    return null;
  });
  if (!response.ok) {
    const value = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    throw new ApiError(response.status,
      typeof value.message === "string" ? value.message : "Không đọc được dữ liệu. Vui lòng thử lại.",
      typeof value.code === "string" ? value.code : "UNKNOWN_ERROR");
  }
  if (payload === null) throw new ApiError(response.status, "Máy chủ trả dữ liệu không hợp lệ.", "INVALID_RESPONSE");
  return payload as T;
}

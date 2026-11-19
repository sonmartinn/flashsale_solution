// Bắn request mua cho E1/E3 (D-09, RESEARCH Pattern 2).
//
// burst tạo MỌI promise fetch trong một vòng map đồng bộ rồi mới await Promise.all, nên toàn bộ request
// cùng bay một lúc (SPECS §13). Trên đường bắn không có log nào: in ra màn hình tốn CPU của chính máy đang đo.
import {
  classifyFetchError,
  classifyStatus,
  emptyCounts,
  parseErrorCode,
  type Bucket,
  type ResponseCounts,
} from "./classify.js";
import type { SaleMode } from "./types.js";

/** Mỗi request tối đa 30 giây; treo lâu hơn thì tính là timeout chứ không làm kẹt cả lượt. */
const BUY_TIMEOUT_MS = 30_000;
const BUY_BODY = JSON.stringify({ qty: 1 });

export interface BuyTarget {
  baseUrl: string;
  saleId: string;
  mode: SaleMode;
  timeoutMs?: number;
}

/**
 * Một request mua của user `userId` (header x-test-user, chỉ có hiệu lực ở chế độ test).
 * Luôn đọc hết thân phản hồi (giải phóng socket). Không bao giờ ném lỗi, không bao giờ in.
 * key là "<status>:<code>" (ví dụ "409:SOLD_OUT", "201:") hoặc "conn"/"timeout" khi fetch bị từ chối.
 */
export async function buyOnce(o: BuyTarget & { userId: string }): Promise<{ bucket: Bucket; key: string }> {
  try {
    const res = await fetch(`${o.baseUrl}/api/sales/${o.saleId}/buy?mode=${o.mode}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": o.userId },
      body: BUY_BODY,
      cache: "no-store",
      signal: AbortSignal.timeout(o.timeoutMs ?? BUY_TIMEOUT_MS),
    });
    const text = await res.text();
    const code = parseErrorCode(text);
    return { bucket: classifyStatus(res.status, code), key: `${res.status}:${code ?? ""}` };
  } catch (err) {
    const bucket = classifyFetchError(err);
    return { bucket, key: bucket === "timeouts" ? "timeout" : "conn" };
  }
}

/**
 * Bắn một request cho mỗi phần tử của userIds, tất cả cùng lúc (E1: mỗi user một id khác nhau;
 * E3: cùng một id lặp lại). durationMs tính từ trước fetch đầu tiên tới khi request cuối cùng xong.
 */
export async function burst(
  o: BuyTarget & { userIds: string[] },
): Promise<{ counts: ResponseCounts; codes: Record<string, number>; durationMs: number }> {
  const target: BuyTarget = {
    baseUrl: o.baseUrl,
    saleId: o.saleId,
    mode: o.mode,
    ...(o.timeoutMs !== undefined ? { timeoutMs: o.timeoutMs } : {}),
  };
  const startedAt = performance.now();
  // Tạo hết các promise trước, chỉ await sau khi mọi request đã được phát đi
  const pending = o.userIds.map((userId) => buyOnce({ ...target, userId }));
  const results = await Promise.all(pending);
  const durationMs = performance.now() - startedAt;

  const counts = emptyCounts();
  const codes: Record<string, number> = {};
  for (const r of results) {
    counts[r.bucket] += 1;
    codes[r.key] = (codes[r.key] ?? 0) + 1;
  }
  return { counts, codes, durationMs };
}

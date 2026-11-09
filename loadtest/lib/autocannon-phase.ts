// Một pha đo E2 (in_stock hoặc sold_out) = một lần gọi autocannon (D-21, D-22, D-23, RESEARCH Pattern 1).
//
// - Mỗi request mang một x-test-user KHÁC NHAU: setupRequest lấy ids[counter++] từ MỘT bộ đếm dùng chung cho
//   mọi connection. autocannon chia `amount` cho từng connection và mỗi client gọi setupRequest đúng một lần
//   cho mỗi request nó ghi, nên tổng số lần gọi bằng amount.
// - Đếm phản hồi trong onResponse (status + mã lỗi JSON), độ trễ lấy từ sự kiện "response" của instance
//   (responseTime, ms). Phân vị do histogram.ts tự tính, không dùng histogram của autocannon.
// - Thời lượng do harness đo: từ ngay trước khi gọi autocannon tới phản hồi CUỐI CÙNG. Không dùng
//   result.duration vì autocannon chỉ trả kết quả ở nhịp sampleInt kế tiếp (thêm tới ~1 s, Pitfall 2).
// - result.errors đã gồm cả timeouts: connErrors = errors - timeouts, không đếm timeout hai lần (Pitfall 3).
// - Một tiến trình, không dùng worker thread, pipelining 1. Không in gì trên đường đo.
import autocannon from "autocannon";
import { classifyStatus, emptyCounts, parseErrorCode, type ResponseCounts } from "./classify.js";

/** Thân request mua: luôn 1 sản phẩm. */
const BUY_BODY = JSON.stringify({ qty: 1 });
/** Timeout mỗi request (giây), giống nhau cho V1 và V2 (D-22). */
const DEFAULT_TIMEOUT_SEC = 10;

export interface PhaseResult {
  /** Tám nhóm phản hồi; connErrors và timeouts lấy từ bộ đếm của autocannon */
  counts: ResponseCounts;
  /** "<status>:<code>" -> số lần, ví dụ "201:" hay "409:SOLD_OUT" */
  codes: Record<string, number>;
  /** Độ trễ từng phản hồi (ms) theo thứ tự nhận */
  latencies: Float64Array;
  /** Từ ngay trước khi gọi autocannon tới phản hồi cuối cùng (ms); 0 khi không có phản hồi nào */
  durationMs: number;
  /** Số phản hồi HTTP đã nhận */
  responses: number;
  /** Số lần setupRequest được gọi (phải bằng số id) */
  setupCalls: number;
  /** Các id đã thật sự gửi, theo thứ tự cấp */
  sentIds: string[];
  /** Bộ đếm riêng của autocannon, chỉ để đối chiếu */
  autocannon: {
    errors: number;
    timeouts: number;
    non2xx: number;
    statusCodeStats: Record<string, { count: number }>;
    durationSec: number;
  };
  /** Chỗ lệch giữa bộ đếm của harness và của autocannon; được ghi lại, không dùng để phán quyết */
  mismatches: string[];
}

export interface PhaseOptions {
  baseUrl: string;
  saleId: string;
  mode: "v1" | "v2";
  connections: number;
  /** Mỗi phần tử là một user; số request của pha = ids.length */
  ids: string[];
  timeoutSec?: number;
}

/** So bộ đếm của harness với của autocannon, trả về mô tả từng chỗ lệch. */
function crossCheck(
  statusTally: Map<number, number>,
  counts: ResponseCounts,
  responses: number,
  latencyCount: number,
  result: autocannon.Result,
  stats: Record<string, { count: number }>,
): string[] {
  const out: string[] = [];
  const statuses = new Set<string>([...Object.keys(stats), ...[...statusTally.keys()].map(String)]);
  for (const status of [...statuses].sort()) {
    const ours = statusTally.get(Number(status)) ?? 0;
    const theirs = stats[status]?.count ?? 0;
    if (ours !== theirs) out.push(`status ${status}: harness ${ours}, autocannon ${theirs}`);
  }
  let our2xx = 0;
  for (const [status, n] of statusTally) if (status >= 200 && status <= 299) our2xx += n;
  if (our2xx !== result["2xx"]) out.push(`2xx: harness ${our2xx}, autocannon ${result["2xx"]}`);
  if (counts.s5xx !== result["5xx"]) out.push(`5xx: harness ${counts.s5xx}, autocannon ${result["5xx"]}`);
  if (responses - our2xx !== result.non2xx) {
    out.push(`non2xx: harness ${responses - our2xx}, autocannon ${result.non2xx}`);
  }
  let onResponseTotal = 0;
  for (const n of statusTally.values()) onResponseTotal += n;
  if (onResponseTotal !== responses) out.push(`onResponse ${onResponseTotal} ≠ sự kiện response ${responses}`);
  if (latencyCount !== responses) out.push(`số độ trễ ghi được ${latencyCount} ≠ số phản hồi ${responses}`);
  return out;
}

/** Chạy một pha: mỗi id một request POST /api/sales/<id>/buy?mode=<mode>, qua `connections` kết nối. */
export function runPhase(o: PhaseOptions): Promise<PhaseResult> {
  const amount = o.ids.length;
  if (amount < o.connections) {
    // autocannon ném lỗi đồng bộ khi amount < connections (Pitfall 4); config đã chặn trước, đây là chốt cuối
    throw new Error(`Số request của pha (${amount}) phải >= số connection (${o.connections})`);
  }

  const ids = o.ids;
  let counter = 0;
  const counts = emptyCounts();
  const codes: Record<string, number> = {};
  const statusTally = new Map<number, number>();
  const latencies = new Float64Array(amount);
  let responses = 0;
  let lastAt = 0;

  const setupRequest = (req: autocannon.Request): autocannon.Request => {
    // Bộ đếm dùng chung cho mọi connection; vượt số id thì gửi id rỗng và setupCalls > amount làm lượt INVALID
    const id = ids[counter] ?? "";
    counter += 1;
    return {
      ...req,
      headers: { ...req.headers, "content-type": "application/json", "x-test-user": id },
      body: BUY_BODY,
    };
  };

  const onResponse = (status: number, body: string): void => {
    const code = parseErrorCode(body);
    counts[classifyStatus(status, code)] += 1;
    const key = `${status}:${code ?? ""}`;
    codes[key] = (codes[key] ?? 0) + 1;
    statusTally.set(status, (statusTally.get(status) ?? 0) + 1);
  };

  return new Promise<PhaseResult>((resolve, reject) => {
    const startedAt = performance.now();
    const instance = autocannon(
      {
        url: o.baseUrl,
        connections: o.connections,
        pipelining: 1,
        timeout: o.timeoutSec ?? DEFAULT_TIMEOUT_SEC,
        amount,
        requests: [
          {
            method: "POST",
            path: `/api/sales/${o.saleId}/buy?mode=${o.mode}`,
            setupRequest,
            onResponse,
          },
        ],
      },
      (err: unknown, result: autocannon.Result) => {
        if (err !== null && err !== undefined) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        counts.timeouts = result.timeouts;
        counts.connErrors = result.errors - result.timeouts;
        const stats: Record<string, { count: number }> = {};
        for (const [status, entry] of Object.entries(result.statusCodeStats ?? {})) {
          stats[status] = { count: entry.count ?? 0 };
        }
        const recorded = Math.min(responses, amount);
        resolve({
          counts,
          codes,
          latencies: latencies.slice(0, recorded),
          durationMs: responses > 0 ? lastAt - startedAt : 0,
          responses,
          setupCalls: counter,
          sentIds: ids.slice(0, Math.min(counter, amount)),
          autocannon: {
            errors: result.errors,
            timeouts: result.timeouts,
            non2xx: result.non2xx,
            statusCodeStats: stats,
            durationSec: result.duration,
          },
          mismatches: crossCheck(statusTally, counts, responses, recorded, result, stats),
        });
      },
    );
    instance.on("response", (_client, _statusCode, _resBytes, responseTime) => {
      if (responses < amount) latencies[responses] = responseTime;
      responses += 1;
      lastAt = performance.now();
    });
  });
}

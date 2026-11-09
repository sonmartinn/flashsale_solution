// Phân vị và trung vị do harness tự tính (D-23, SPECS §10).
//
// p50/p95/p99 dùng phương pháp nearest-rank trên mảng ĐÃ SẮP XẾP đầy đủ, không dùng histogram của autocannon
// (không có p95, và bucket HDR chỉ xấp xỉ). Công thức cố định ở đây và được ghi trong tài liệu quy trình.
// Sắp xếp luôn theo số: Float64Array.prototype.sort hoặc (a, b) => a - b, không bao giờ sort() mặc định của
// Array (sắp theo chuỗi, "100" đứng trước "9").

/** Tóm tắt một mảng độ trễ (ms). Mọi trường là NaN khi mảng rỗng (ô CSV khi đó để trống). */
export interface LatencySummary {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
}

/**
 * Phân vị p (0 < p <= 100) theo nearest-rank: phần tử thứ ceil(p/100 * n) (đếm từ 1) của mảng đã sắp xếp tăng dần.
 * Mảng rỗng cho NaN.
 */
export function nearestRank(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] as number;
}

/** n, p50, p95, p99, trung bình và lớn nhất của một mảng độ trễ. Không sửa mảng đầu vào. */
export function summarize(latencies: Float64Array): LatencySummary {
  const n = latencies.length;
  if (n === 0) {
    return { n: 0, p50: Number.NaN, p95: Number.NaN, p99: Number.NaN, mean: Number.NaN, max: Number.NaN };
  }
  // Bản sao rồi sắp xếp theo số (Float64Array.sort không cần hàm so sánh)
  const sorted = Float64Array.from(latencies).sort();
  let sum = 0;
  for (const v of sorted) sum += v;
  return {
    n,
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    p99: nearestRank(sorted, 99),
    mean: sum / n,
    max: sorted[n - 1] as number,
  };
}

/** Trung vị: phần tử giữa, hoặc trung bình hai phần tử giữa khi số phần tử chẵn. Mảng rỗng cho NaN. */
export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

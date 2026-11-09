// Bộ canh cổng TIME_WAIT (RESEARCH Pattern 4, Pitfall 1).
//
// Mỗi kết nối loopback ngắn để lại một socket TIME_WAIT phía client khoảng 120 giây. Windows chỉ có 16384
// cổng tạm thời, nên vài lượt E1/E2 liên tiếp có thể làm cạn cổng: request sau bị lỗi kết nối và lượt đó
// thành INVALID. Trước mỗi lượt bắn, bộ canh đếm socket TIME_WAIT tới cổng server và chờ (có giới hạn) cho
// tới khi TIME_WAIT + số socket dự kiến <= ngân sách.
//
// Chỉ ĐỌC (netstat) và CHỜ: không bao giờ đổi thiết lập hệ điều hành, không bao giờ dừng tiến trình nào.
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { InvalidError } from "./types.js";

/** Ngân sách cổng: 10000 trong 16384 cổng tạm thời, chừa chỗ cho ứng dụng khác. */
export const PORT_BUDGET = 10_000;
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 180_000;

export interface PortBudgetOptions {
  /** Cổng của server đang đo */
  port: number;
  /** Số socket mới lượt sắp tới có thể mở (E1: số user, E3: 10, E2: số connection) */
  planned: number;
  budget?: number;
  pollMs?: number;
  maxWaitMs?: number;
  /** Đọc output netstat; null khi không chạy được (mặc định readNetstat) */
  read?: () => string | null;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Số dòng TIME_WAIT có một địa chỉ kết thúc đúng bằng `:<port>` (Windows, IPv6 [::1]:5000) hoặc
 * `.<port>` (macOS 127.0.0.1.5000). So khớp cả token nên :50000 không bao giờ bị tính là :5000.
 */
export function countTimeWait(output: string, port: number): number {
  const colon = `:${port}`;
  const dot = `.${port}`;
  let count = 0;
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("TIME_WAIT")) continue;
    const tokens = line.trim().split(/\s+/);
    if (tokens.some((t) => t.endsWith(colon) || t.endsWith(dot))) count++;
  }
  return count;
}

/**
 * Chạy `netstat -an -p tcp` (không qua shell). Bộ đệm stdout đặt 64 MiB vì mặc định 1 MiB làm tiến trình
 * chết với ENOBUFS khi có khoảng 15000 dòng. Trả null khi không chạy được hoặc thoát mã khác 0.
 */
export function readNetstat(): string | null {
  const result = spawnSync("netstat", ["-an", "-p", "tcp"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error !== undefined || result.status !== 0) return null;
  return result.stdout;
}

/** Chỉ cảnh báo thiếu netstat một lần cho mỗi tiến trình. */
let warnedNoNetstat = false;

/**
 * Chờ tới khi TIME_WAIT + planned <= budget, kiểm tra lại mỗi pollMs, tối đa maxWaitMs (sau đó INVALID).
 * Không đọc được netstat thì cảnh báo một lần và bỏ qua (skipped).
 */
export async function waitForPortBudget(
  o: PortBudgetOptions,
): Promise<{ waitedMs: number; timeWait: number; skipped: boolean }> {
  const budget = o.budget ?? PORT_BUDGET;
  const pollMs = o.pollMs ?? DEFAULT_POLL_MS;
  const maxWaitMs = o.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const read = o.read ?? readNetstat;
  const sleep = o.sleep ?? ((ms: number) => delay(ms));
  const now = o.now ?? (() => performance.now());
  const log = o.log ?? ((message: string) => console.log(message));

  const startedAt = now();
  let output = read();
  if (output === null) {
    if (!warnedNoNetstat) {
      warnedNoNetstat = true;
      log("[CẢNH BÁO] Không chạy được netstat: bỏ qua bộ canh cổng TIME_WAIT, lỗi kết nối có thể tăng nếu cạn cổng.");
    }
    return { waitedMs: 0, timeWait: 0, skipped: true };
  }
  let timeWait = countTimeWait(output, o.port);
  let announced = false;
  while (timeWait + o.planned > budget) {
    const elapsed = now() - startedAt;
    if (elapsed >= maxWaitMs) {
      throw new InvalidError(
        `cổng tạm thời vẫn vượt ngân sách sau ${Math.round(maxWaitMs / 1000)} giây ` +
          `(${timeWait} TIME_WAIT + ${o.planned} dự kiến > ${budget})`,
      );
    }
    if (!announced) {
      announced = true;
      log(
        `Chờ cổng tạm thời: ${timeWait} socket TIME_WAIT tới cổng ${o.port} + ${o.planned} dự kiến > ${budget}, ` +
          `kiểm tra lại mỗi ${Math.round(pollMs / 1000)} giây...`,
      );
    }
    await sleep(pollMs);
    output = read();
    if (output === null) return { waitedMs: now() - startedAt, timeWait, skipped: true };
    timeWait = countTimeWait(output, o.port);
  }
  // Chỉ tính là đã chờ khi thật sự có ngủ; thời gian chạy netstat lần đầu không phải là chờ cổng
  return { waitedMs: announced ? now() - startedAt : 0, timeWait, skipped: false };
}

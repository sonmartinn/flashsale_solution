// Bộ canh cổng TIME_WAIT (RESEARCH Pattern 4). Khung chữ ký cho bước RED, chưa có hành vi.

export const PORT_BUDGET = 10_000;

export interface PortBudgetOptions {
  port: number;
  planned: number;
  budget?: number;
  pollMs?: number;
  maxWaitMs?: number;
  read?: () => string | null;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

export function countTimeWait(_output: string, _port: number): number {
  return 0;
}

export function readNetstat(): string | null {
  return null;
}

export async function waitForPortBudget(
  _o: PortBudgetOptions,
): Promise<{ waitedMs: number; timeWait: number; skipped: boolean }> {
  return { waitedMs: 0, timeWait: 0, skipped: false };
}

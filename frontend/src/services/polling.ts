const intervalMs = 2_000;

export interface PollingEnvironment {
  isVisible(): boolean;
  observeVisibility(listener: () => void): () => void;
  schedule(listener: () => void, delay: number): () => void;
}

interface PollingOptions<T> {
  environment: PollingEnvironment;
  read(signal: AbortSignal): Promise<T>;
  onData(data: T): void;
  onError(error: unknown): void;
  paused?: boolean;
}

/** Lần đọc tự động kế tiếp tính từ khi lần trước kết thúc. */
export function createPollingController<T>({ environment, read, onData, onError, paused = false }: PollingOptions<T>) {
  let visible = environment.isVisible();
  let disposed = false;
  let queued = false;
  let inFlight: AbortController | undefined;
  let cancelTimer: (() => void) | undefined;

  function clearTimer() {
    cancelTimer?.();
    cancelTimer = undefined;
  }

  async function readQueued() {
    if (disposed || !visible || !queued || inFlight) return;
    queued = false;
    const token = new AbortController();
    inFlight = token;
    try {
      const value = await read(token.signal);
      if (!token.signal.aborted) onData(value);
    } catch (error) {
      if (!token.signal.aborted) onError(error);
    } finally {
      inFlight = undefined;
      if (queued) void readQueued();
      else if (!disposed && visible && !paused) cancelTimer = environment.schedule(refresh, intervalMs);
    }
  }

  function refresh(replace = false) {
    if (disposed || !visible) return;
    clearTimer();
    if (!replace && inFlight && !inFlight.signal.aborted) return;
    queued = true;
    if (replace) inFlight?.abort();
    void readQueued();
  }

  function invalidate() {
    clearTimer();
    queued = false;
    inFlight?.abort();
  }

  const unobserve = environment.observeVisibility(() => {
    const current = environment.isVisible();
    if (current === visible) return;
    visible = current;
    if (!visible) invalidate();
    else if (!paused) refresh();
  });
  if (!paused) refresh();

  return {
    refresh,
    setPaused(value: boolean) {
      if (disposed || paused === value) return;
      paused = value;
      if (paused) invalidate();
      else refresh();
    },
    dispose() {
      disposed = true;
      unobserve();
      invalidate();
    },
  };
}

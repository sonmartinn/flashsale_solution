import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { createPollingController, type PollingEnvironment } from "../services/polling.ts";

const browser: PollingEnvironment = {
  isVisible: () => document.visibilityState === "visible",
  observeVisibility(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
  schedule(listener, delay) {
    const timer = window.setTimeout(listener, delay);
    return () => window.clearTimeout(timer);
  },
};

interface Options<T> {
  key: string | null;
  paused?: boolean;
  read(signal: AbortSignal): Promise<T>;
  onData(value: T): void;
  onError(cause: unknown): void;
}

export function usePolling<T>(options: Options<T>) {
  const { key, paused = false } = options;
  const latest = useEffectEvent(() => options);
  const controller = useRef<ReturnType<typeof createPollingController<T>>>(undefined);

  useEffect(() => {
    if (key === null) return;
    const current = createPollingController<T>({
      environment: browser,
      paused: latest().paused,
      read: signal => latest().read(signal),
      onData: value => { if (latest().key === key) latest().onData(value); },
      onError: cause => { if (latest().key === key) latest().onError(cause); },
    });
    controller.current = current;
    return () => {
      current.dispose();
      controller.current = undefined;
    };
  }, [key]);

  useEffect(() => controller.current?.setPaused(paused), [paused]);

  return {
    refresh: useCallback((replace = false) => controller.current?.refresh(replace), []),
    setPaused: useCallback((value: boolean) => controller.current?.setPaused(value), []),
  };
}

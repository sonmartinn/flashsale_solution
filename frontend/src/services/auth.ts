import { ApiError, requestJson } from "./api.ts";

export interface Session {
  token: string;
  user: { id: string; name: string; email: string; role: "user" | "admin" };
}
export const SESSION_KEY = "flashsale.session";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface SessionSnapshot { session: Session | null; generation: number; persistent: boolean }

/** Lấy đúng dữ liệu phiên cần dùng; tuyệt đối không sao chép password hoặc khóa lạ. */
export function parseSession(value: unknown): Session | null {
  if (!value || typeof value !== "object") return null;
  const { token, user } = value as Record<string, unknown>;
  if (typeof token !== "string" || !token || /\s/.test(token) || !user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.id !== "string" || !/^[a-f\d]{24}$/i.test(u.id) || typeof u.name !== "string" || !u.name.trim()
    || typeof u.email !== "string" || !u.email || (u.role !== "user" && u.role !== "admin")) return null;
  return { token, user: { id: u.id, name: u.name, email: u.email, role: u.role } };
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || /[\\\u0000-\u0020\u007f%]/.test(value)) return "/";
  // Chỉ cho về các route của ứng dụng, không vòng lại login hay URL có thể được chuẩn hóa ra ngoài.
  return /^(?:\/(?:sales\/[a-f\d]{24}|orders|admin)?|\/#products)$/i.test(value) ? value : "/";
}
export const loginPath = (returnTo: string): string => `/login?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`;

export async function authenticate(kind: "login" | "register", input: { email: string; password: string; name?: string }, signal?: AbortSignal): Promise<Session> {
  const body = kind === "register" ? { name: input.name ?? "", email: input.email, password: input.password }
    : { email: input.email, password: input.password };
  const session = parseSession(await requestJson<unknown>(`/auth/${kind}`, { method: "POST", body, signal }));
  if (!session) throw new ApiError(200, "Máy chủ trả phiên đăng nhập không hợp lệ.", "INVALID_RESPONSE");
  return session;
}

export class StaleSessionError extends Error {
  constructor() { super("Phiên đã thay đổi, bỏ qua phản hồi cũ."); this.name = "StaleSessionError"; }
}

export function createSessionStore(storage?: StorageLike) {
  let session: Session | null = null;
  let persistent = storage !== undefined;
  try {
    const text = storage?.getItem(SESSION_KEY);
    if (text) {
      try { session = parseSession(JSON.parse(text)); } catch { /* Bỏ dữ liệu phiên hỏng. */ }
      if (session) storage?.setItem(SESSION_KEY, JSON.stringify(session));
      else storage?.removeItem(SESSION_KEY);
    }
  } catch { persistent = false; }
  let snapshot: SessionSnapshot = { session, generation: 0, persistent };
  const listeners = new Set<() => void>();
  const current = (generation: number) => snapshot.generation === generation;
  const replace = (next: Session | null) => {
    let saved = storage !== undefined;
    try {
      if (next) storage?.setItem(SESSION_KEY, JSON.stringify(next));
      else storage?.removeItem(SESSION_KEY);
    } catch { saved = false; }
    snapshot = { session: next, generation: snapshot.generation + 1, persistent: saved };
    listeners.forEach(listener => listener());
  };
  const logout = (expectedGeneration?: number) => {
    if (expectedGeneration !== undefined && !current(expectedGeneration)) return false;
    replace(null); return true;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isCurrent: current,
    accept: (value: unknown) => {
      const next = parseSession(value);
      if (!next) throw new Error("Phiên đăng nhập không hợp lệ.");
      replace(next);
    },
    logout,
    async request<T>(path: string, options: Parameters<typeof requestJson>[1] = {}): Promise<T> {
      const sent = snapshot;
      if (!sent.session) throw new ApiError(401, "Bạn chưa đăng nhập.", "UNAUTHORIZED");
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${sent.session.token}`);
      try {
        const payload = await requestJson<T>(path, { ...options, headers });
        if (!current(sent.generation)) throw new StaleSessionError();
        return payload;
      } catch (error) {
        if (!current(sent.generation)) throw new StaleSessionError();
        if (error instanceof ApiError && error.status === 401 && error.code === "UNAUTHORIZED") logout(sent.generation);
        throw error;
      }
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;

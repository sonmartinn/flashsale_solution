import { createContext, useContext, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { createSessionStore, type SessionStore } from "../services/auth.ts";

const AuthContext = createContext<SessionStore | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => {
    try { return createSessionStore(window.localStorage); }
    catch { return createSessionStore(); }
  });
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const store = useContext(AuthContext);
  if (!store) throw new Error("Thiếu AuthProvider.");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { ...snapshot, store };
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "./api";
import { DocumentCache } from "./documentCache";

const Context = createContext<DocumentCache | null>(null);

export function DocumentDataProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(
    () => new DocumentCache((path, signal) => api(path, { signal })),
  );
  const mount = useRef(0);
  useEffect(() => {
    const generation = ++mount.current;
    return () => {
      // React StrictMode immediately replays setup; only dispose a real unmount.
      queueMicrotask(() => {
        if (mount.current === generation) cache.dispose();
      });
    };
  }, [cache]);
  // The provider is keyed by the authenticated user; no data is shared across logins.
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}

export function useDocumentCache() {
  const cache = useContext(Context);
  if (!cache) throw new Error("DocumentDataProvider is required");
  return cache;
}

export function useDocumentData<T>(path: string | null, ttl = 60_000) {
  const cache = useDocumentCache();
  const subscribe = useCallback(
    (listener: () => void) =>
      path ? cache.subscribe(path, listener) : () => {},
    [cache, path],
  );
  const snapshot = useSyncExternalStore(subscribe, () => cache.get<T>(path));
  useEffect(() => {
    if (path) void cache.load(path, ttl).catch(() => {});
  }, [cache, path, ttl, snapshot.revision]);
  useEffect(() => {
    const refresh = () => {
      if (path && document.visibilityState === "visible")
        void cache.load(path, ttl).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [cache, path, ttl]);
  const reload = useCallback(() => {
    if (path) cache.invalidate(path, true);
  }, [cache, path]);
  return {
    ...snapshot,
    loading: !!path && !snapshot.data && !snapshot.error,
    refreshing: snapshot.loading,
    reload,
  };
}

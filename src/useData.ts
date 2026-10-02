import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
export function useData<T>(path: string | null, keepPreviousOnReload = false) {
  const fetchedPath = useRef<string | null>(null);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const preserve =
      keepPreviousOnReload && path !== null && fetchedPath.current === path;
    if (!preserve) setData(null);
    setError("");
    setLoading(Boolean(path) && !preserve);
    setRefreshing(Boolean(path));
    if (path)
      api<T>(path, { signal: controller.signal })
        .then((x) => {
          if (live) {
            fetchedPath.current = path;
            setData(x);
          }
        })
        .catch((e) => {
          if (live && e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (live) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    return () => {
      live = false;
      controller.abort();
    };
  }, [path, revision, keepPreviousOnReload]);
  const reload = useCallback(() => setRevision((x) => x + 1), []);
  return { data, error, loading, refreshing, reload };
}

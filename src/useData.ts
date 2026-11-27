import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { preparedRetryDelay } from "./preparedRetry";
export function useData<T>(
  path: string | null,
  keepPreviousOnReload = false,
  dataVersion?: string,
  retryPreparing = false,
) {
  const fetchedPath = useRef<string | null>(null);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const preserve =
      keepPreviousOnReload && path !== null && fetchedPath.current === path;
    if (!preserve) setData(null);
    setError("");
    setLoading(Boolean(path) && !preserve);
    setRefreshing(Boolean(path));
    const fetchData = (retries: number) => {
      if (!path || !live) return;
      setRefreshing(true);
      void api<T>(path, { signal: controller.signal })
        .then((x) => {
          if (live) {
            fetchedPath.current = path;
            setData(x);
            setError("");
          }
        })
        .catch((e) => {
          if (!live || e.name === "AbortError") return;
          if (e.status === 401 || e.status === 403) {
            fetchedPath.current = null;
            setData(null);
          }
          setError(e.message);
          const delay = retryPreparing ? preparedRetryDelay(e, retries) : null;
          if (delay !== null)
            retryTimer = setTimeout(() => fetchData(retries + 1), delay);
        })
        .finally(() => {
          if (live) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    };
    fetchData(0);
    return () => {
      live = false;
      controller.abort();
      clearTimeout(retryTimer);
    };
  }, [path, revision, keepPreviousOnReload, dataVersion, retryPreparing]);
  const reload = useCallback(() => setRevision((x) => x + 1), []);
  return { data, error, loading, refreshing, reload };
}

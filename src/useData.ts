import { useEffect, useState } from "react";
import { api } from "./api";
export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setData(null);
    setError("");
    setLoading(Boolean(path));
    if (path)
      api<T>(path, { signal: controller.signal })
        .then((x) => {
          if (live) setData(x);
        })
        .catch((e) => {
          if (live && e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    return () => {
      live = false;
      controller.abort();
    };
  }, [path, revision]);
  return { data, error, loading, reload: () => setRevision((x) => x + 1) };
}

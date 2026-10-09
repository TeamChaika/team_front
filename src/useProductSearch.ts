import { useEffect, useState } from "react";
import { api } from "./api";
import {
  currentProductRows,
  startProductSearch,
  type SearchProduct,
} from "./productSearchModel";

type SearchState = {
  scope: string;
  query: string;
  retry: number;
  rows: SearchProduct[];
  error: string;
  loading: boolean;
};

export function useProductSearch(
  scope: string,
  search: string,
  parameter: "q" | "query",
  enabled = true,
  retry = 0,
) {
  const query = search.trim();
  const [state, setState] = useState<SearchState | null>(null);
  useEffect(() => {
    if (!enabled || query.length < 2) {
      setState(null);
      return;
    }
    setState({ scope, query, retry, rows: [], error: "", loading: true });
    return startProductSearch({
      load: async (signal) => {
        const data = await api<{
          rows?: SearchProduct[];
          items?: SearchProduct[];
        }>(`${scope}?${parameter}=${encodeURIComponent(query)}`, { signal });
        return data.rows || data.items || [];
      },
      result: (rows) =>
        setState({ scope, query, retry, rows, error: "", loading: false }),
      error: (error) =>
        setState({ scope, query, retry, rows: [], error, loading: false }),
    });
  }, [scope, query, parameter, enabled, retry]);
  const current =
    enabled &&
    query.length >= 2 &&
    state?.scope === scope &&
    state.query === query &&
    state.retry === retry;
  return {
    rows: current ? currentProductRows(scope, query, state) : [],
    error: current ? state.error : "",
    loading: enabled && query.length >= 2 && (!current || state.loading),
  };
}

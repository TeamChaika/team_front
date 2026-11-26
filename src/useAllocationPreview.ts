import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
  previewMatches,
  type AllocationInput,
  type AllocationPreview,
} from "./profitLossModel";

type PreviewState = {
  body: string;
  loading: boolean;
  preview: AllocationPreview | null;
  error: string;
};

export function useAllocationPreview(
  input: AllocationInput | null,
  automatic: boolean,
) {
  const body = input && input.method !== "pending" ? JSON.stringify(input) : "";
  const [state, setState] = useState<PreviewState | null>(null);
  const active = useRef<AbortController | null>(null);
  const stop = useCallback(() => active.current?.abort(), []);
  const schedule = useCallback(
    (delay: number) => {
      stop();
      if (!body) {
        setState(null);
        return;
      }
      const controller = new AbortController();
      active.current = controller;
      const { signal } = controller;
      setState({ body, loading: true, preview: null, error: "" });
      const timer = window.setTimeout(async () => {
        try {
          const result = await api<AllocationPreview>(
            "/profit-loss/allocations/preview",
            { method: "POST", body, signal },
          );
          if (signal.aborted) return;
          const submitted: AllocationInput = JSON.parse(body);
          if (!previewMatches(submitted, result))
            throw new Error("Сервер вернул неполный расчёт долей.");
          setState({ body, loading: false, preview: result, error: "" });
        } catch (reason) {
          if (signal.aborted) return;
          setState({
            body,
            loading: false,
            preview: null,
            error:
              reason instanceof Error ? reason.message : "Расчёт не получен.",
          });
        }
      }, delay);
      signal.addEventListener("abort", () => window.clearTimeout(timer), {
        once: true,
      });
    },
    [body, stop],
  );
  const invalidate = useCallback(() => {
    if (automatic) schedule(250);
    else {
      stop();
      setState(null);
    }
  }, [automatic, schedule, stop]);
  useEffect(() => {
    invalidate();
    return stop;
  }, [invalidate, stop]);

  const current = state?.body === body ? state : null;
  return {
    preview: current?.preview ?? null,
    loading: current?.loading ?? false,
    error: current?.error ?? "",
    calculate: () => schedule(0),
    invalidate,
  };
}

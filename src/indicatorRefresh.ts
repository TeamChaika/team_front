export type IndicatorPeriod = {
  start: string;
  end: string;
  value: string | number | null;
  partial: boolean;
  observed_at: string | null;
};
export type IndicatorReport = {
  status: "ready";
  current: IndicatorPeriod;
  previous: IndicatorPeriod;
  source: string;
  observed_at: string;
  stale?: boolean;
  refreshing?: boolean;
  refresh_error?: string | null;
  next_refresh_at?: string | null;
};
export type IndicatorPending = { status: "loading"; retry_after: number };
export type IndicatorCard = {
  report?: IndicatorReport;
  error?: string;
  refreshing?: boolean;
};
export type IndicatorSnapshot = {
  queryKey: string;
  cards: Record<string, IndicatorCard>;
};

// Scope is checked during render as well as updates: effects run after render.
export function indicatorCards(snapshot: IndicatorSnapshot, queryKey: string) {
  return snapshot.queryKey === queryKey ? snapshot.cards : {};
}
export function updateIndicatorCard(
  snapshot: IndicatorSnapshot,
  queryKey: string,
  key: string,
  patch: Partial<IndicatorCard>,
): IndicatorSnapshot {
  const cards = indicatorCards(snapshot, queryKey);
  return { queryKey, cards: { ...cards, [key]: { ...cards[key], ...patch } } };
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

export function startIndicatorRefresh(options: {
  keys: string[];
  request: (
    key: string,
    signal: AbortSignal,
  ) => Promise<IndicatorReport | IndicatorPending>;
  update: (key: string, patch: Partial<IndicatorCard>) => void;
  errorMessage: (error: unknown) => string;
  visibility: Pick<
    Document,
    "hidden" | "addEventListener" | "removeEventListener"
  >;
}) {
  const controller = new AbortController();
  const { signal } = controller;
  const queue: string[] = [];
  const inFlight = new Set<string>();
  let workers = 0;
  async function load(key: string) {
    inFlight.add(key);
    options.update(key, { refreshing: true, error: undefined });
    try {
      const deadline = Date.now() + 15 * 60_000;
      while (!signal.aborted) {
        const result = await options.request(key, signal);
        if (signal.aborted) return;
        if (result.status === "ready") {
          options.update(key, {
            report: result,
            refreshing: false,
            error: result.refresh_error
              ? "Обновление задерживается. Показаны последние данные."
              : undefined,
          });
          return;
        }
        if (Date.now() >= deadline)
          throw new Error("iiko долго формирует отчёт. Повторите загрузку.");
        await pause(
          Math.min(10, Math.max(1, result.retry_after)) * 1000,
          signal,
        );
      }
    } catch (error) {
      if (!signal.aborted)
        options.update(key, {
          refreshing: false,
          error: options.errorMessage(error),
        });
    } finally {
      inFlight.delete(key);
    }
  }
  async function worker() {
    workers++;
    try {
      while (queue.length && !signal.aborted) await load(queue.shift()!);
    } finally {
      workers--;
    }
  }
  function refresh(keys = options.keys) {
    if (signal.aborted || options.visibility.hidden) return;
    for (const key of keys)
      if (!queue.includes(key) && !inFlight.has(key)) queue.push(key);
    while (queue.length && workers < 2) void worker();
  }
  const visible = () => {
    if (!options.visibility.hidden) refresh();
  };
  const timer = setInterval(refresh, 60_000);
  options.visibility.addEventListener("visibilitychange", visible);
  refresh();
  return {
    refresh: (key: string) => refresh([key]),
    stop: () => {
      clearInterval(timer);
      options.visibility.removeEventListener("visibilitychange", visible);
      controller.abort();
    },
  };
}

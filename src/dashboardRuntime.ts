// The adapter is installed before mounting dashboard consumers. Each request captures
// its own adapter so a late response cannot fall through to another API origin.
export type DashboardRuntime = {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  renew: () => Promise<Response>;
};
let runtime: DashboardRuntime | null = null;
export function getDashboardRuntime() {
  return runtime;
}
export function installDashboardRuntime(next: DashboardRuntime) {
  runtime = next;
  return () => {
    if (runtime === next) runtime = null;
  };
}
export const tenantDashboardSections = ["overview", "sales"];
export function tenantSections(assigned: string[] = []) {
  return assigned.filter((section) =>
    tenantDashboardSections.includes(section),
  );
}

export function dashboardSectionAvailable(
  assigned: string[] | undefined,
  section: string,
) {
  return assigned?.includes(section) ?? true;
}

// iiko permits one report operation per connection. Keep this queue inside one
// tenant runtime; authentication and the legacy dashboard never wait on it.
export function serializeTenantReports(
  request: DashboardRuntime["request"],
): DashboardRuntime["request"] {
  let reports: Promise<void> = Promise.resolve();
  return (path, init = {}) => {
    if (
      (init.method && init.method !== "GET") ||
      !/^\/(?:overview(?:\?|$)|sales\/)/.test(path)
    )
      return request(path, init);
    const signal = init.signal;
    if (signal?.aborted) return Promise.reject(signal.reason);
    const result = reports.then(() => {
      signal?.throwIfAborted();
      return request(path, init);
    });
    reports = result.then(
      () => undefined,
      () => undefined,
    );
    if (!signal) return result;
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      result
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
  };
}

export function canLoadRecentOverview(
  tenant: boolean,
  loading: boolean,
  current: { start: string; end: string } | null | undefined,
  selected: { start: string; end: string },
) {
  return (
    !tenant ||
    (!loading &&
      current?.start === selected.start &&
      current.end === selected.end)
  );
}

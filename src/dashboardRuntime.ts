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

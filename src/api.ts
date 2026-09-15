export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public employeePending = false,
  ) {
    super(message);
  }
}
const apiBase = (import.meta.env.VITE_API_BASE_URL?.trim() || "/api").replace(
  /\/+$/,
  "",
);
let refresh: Promise<Response> | null = null;
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const r = await fetch(apiBase + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (r.status === 401 && retry && !path.startsWith("/auth/")) {
    if (!refresh)
      refresh = fetch(apiBase + "/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).finally(() => {
        refresh = null;
      });
    const renewed = await refresh;
    if (renewed.ok) return api<T>(path, init, false);
    if ([401, 403].includes(renewed.status))
      window.dispatchEvent(new Event("session-lost"));
    else
      throw new ApiError(
        "Не удалось обновить сессию. Повторите запрос позже.",
        renewed.status,
      );
  }
  const body = await r.json();
  if (!r.ok)
    throw new ApiError(
      typeof body.detail === "string"
        ? body.detail
        : typeof body.detail?.message === "string"
          ? body.detail.message
          : "Не удалось получить данные.",
      r.status,
      body.detail?.employee_pending === true,
    );
  return body;
}
export type Row = Record<string, unknown>;
export type Column = { key: string; label: string };
export type PageData = {
  rows: Row[];
  columns: Column[];
  total: number;
  offset: number;
  limit: number;
};
export type Meta = {
  today?: string;
  live_sales_enabled?: boolean;
  user: { id: string; display_name: string; role: string };
  departments: { id: string; name: string; code: string }[];
  sales_dates: string[];
  balance_dates: string[];
};
export type SalesRow = {
  live?: boolean;
  ordinal: number;
  request: Row;
  business_date: string;
  report_id: string;
  observed_at: string;
  department_id: string;
  department: string;
  revenue: string;
  cost: string | null;
  checks: string | null;
  guests: string | null;
  discount: string | null;
  return_sum: string | null;
  quantity: string | null;
  dimensions: Record<string, string | null>;
  reviewed: boolean;
};
export type Sales = {
  live?: LiveSource;
  partial_days?: { date: string; observed_at: string }[];
  reconciliation_issues?: {
    date: string;
    report: string;
    field: string;
    department: string | null;
    department_id: string;
    daily: string | null;
    actual: string | null;
    delta: string | null;
  }[];
  kind: string;
  rows: SalesRow[];
  totals: Record<string, string | null>;
  hourly: { hour: string; revenue: string; checks: string; guests: string }[];
  discount_groups?: {
    department_id: string;
    department: string | null;
    totals: { revenue: string | null; discount: string | null };
  }[];
  payment_groups?: {
    group: string | null;
    totals: Record<string, string | null>;
    rows: SalesRow[];
  }[];
  loaded_dates: string[];
  missing_dates: string[];
  complete: boolean;
  start: string;
  end: string;
};
export type LiveSource = {
  source: "iiko_api";
  date: string;
  observed_at: string;
  stale: boolean;
  cache_seconds: number;
};
export const money = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(v));
export const number = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(
        Number(v),
      );
export function dateText(v: unknown) {
  if (!v) return "—";
  let raw = String(v).replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw))
    raw += "+03:00";
  const d = new Date(raw);
  return Number.isNaN(d.getTime())
    ? String(v)
    : new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(String(v).includes(":")
          ? { hour: "2-digit" as const, minute: "2-digit" as const }
          : {}),
        timeZone: "Europe/Simferopol",
      }).format(d);
}
export function csv(name: string, cols: Column[], rows: Row[]) {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const content =
    "\uFEFF" +
    [
      cols.map((c) => cell(c.label)).join(";"),
      ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(";")),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

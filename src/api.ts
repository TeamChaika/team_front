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
const sessionChannel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("chaika-auth-session");
if (sessionChannel)
  sessionChannel.onmessage = () =>
    window.dispatchEvent(new Event("session-lost"));
let refresh: Promise<Response> | null = null;
async function authLock<T>(operation: () => Promise<T>): Promise<T> {
  // Serialize cookie rotation and sign-out across tabs on the same site.
  return navigator.locks
    ? navigator.locks.request("chaika-auth-session", operation)
    : operation();
}
export function renewSession(): Promise<Response> {
  if (!refresh)
    refresh = authLock(() =>
      fetch(apiBase + "/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
      }),
    )
      .then((response) => {
        if ([401, 403].includes(response.status))
          window.dispatchEvent(new Event("session-lost"));
        return response;
      })
      .finally(() => {
        refresh = null;
      });
  return refresh;
}
async function request(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const send = () =>
    fetch(apiBase + path, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  const r = await ([
    "/auth/login",
    "/auth/logout",
    "/profile/password",
  ].includes(path)
    ? authLock(send)
    : send());
  if (r.ok && ["/auth/login", "/auth/logout"].includes(path))
    sessionChannel?.postMessage("session-changed");
  init.signal?.throwIfAborted();
  if (r.status === 401 && retry && !path.startsWith("/auth/")) {
    const renewed = await renewSession();
    if (renewed.ok) return request(path, init, false);
    if (![401, 403].includes(renewed.status))
      throw new ApiError(
        "Не удалось обновить сессию. Повторите запрос позже.",
        renewed.status,
      );
  }
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(
      typeof body.detail === "string"
        ? body.detail
        : typeof body.detail?.message === "string"
          ? body.detail.message
          : "Не удалось получить данные.",
      r.status,
      body.detail?.employee_pending === true,
    );
  }
  return r;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function apiBlob(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  const response = await request(path, init);
  if (
    !response.headers
      .get("content-type")
      ?.startsWith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
  )
    throw new ApiError("Сервер не вернул файл Excel.", 502);
  return response.blob();
}
export async function apiCsv(path: string): Promise<Blob> {
  const response = await request(path);
  if (!response.headers.get("content-type")?.startsWith("text/csv"))
    throw new ApiError("Сервер не вернул CSV с документами.", 502);
  return response.blob();
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
  documents_enabled?: boolean;
  sections?: string[];
  can_manage?: boolean;
  modules?: ("iiko" | "deposits")[];
  today?: string;
  live_sales_enabled?: boolean;
  user: {
    id: string;
    display_name: string;
    role: string;
    all_departments?: boolean;
  };
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

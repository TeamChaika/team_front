export const supportStatuses = {
  new: "Новое",
  investigating: "В работе",
  resolved: "Решено",
  dismissed: "Закрыто",
} as const;
export type SupportStatus = keyof typeof supportStatuses;
export type SupportTicket = {
  id: string;
  company_id: string | null;
  company_name: string;
  actor_id: string;
  actor_name?: string;
  description: string;
  screen: string;
  status: SupportStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  event_id: string | null;
  event?: SupportIncident | null;
  audit?: {
    id?: string;
    status?: SupportStatus;
    to_status?: SupportStatus;
    from_status?: SupportStatus | null;
    actor_id?: string;
    actor_name?: string;
    note?: string;
    created_at: string;
  }[];
};
export type SupportPage<T = SupportTicket> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
export type SupportEvent = {
  client_request_id: string;
  source: "browser";
  code: "browser_error" | "unhandled_rejection" | "api_error";
  screen: string;
  status_code?: number;
  request_id?: string;
};
export type SupportClient = {
  list: (offset: number) => Promise<SupportPage>;
  create: (body: {
    client_request_id: string;
    description: string;
    screen: string;
  }) => Promise<SupportTicket>;
  event: (body: SupportEvent) => Promise<unknown>;
};
// Only fixed screen names leave the browser. Never forward locations, messages or stacks.
export function supportScreen(path: string): string {
  const normalized = path.replace(/^\/tenant\/[^/]+/, "");
  const root = normalized.split("/")[1];
  if (!root) return "overview";
  const screens: Record<string, string> = {
    sales: "sales",
    indicators: "reports",
    charts: "reports",
    invoices: "incoming",
    outgoing: "outgoing",
    transfers: "transfers",
    writeoffs: "writeoffs",
    deposits: "deposits",
    management: "management",
    profile: "profile",
  };
  return screens[root] || "other";
}
export function createSupportCapture(
  send: SupportClient["event"],
  screen: () => string,
  now = Date.now,
) {
  const recent = new Map<string, number>();
  let sentAt: number[] = [];
  return (code: SupportEvent["code"], status?: number, requestId?: unknown) => {
    const safeScreen = supportScreen(screen());
    const statusCode =
      Number.isInteger(status) && status! >= 500 && status! <= 599
        ? status
        : undefined;
    if (code === "api_error" && statusCode === undefined) return;
    const key = `${code}:${safeScreen}:${statusCode || ""}`;
    const time = now();
    sentAt = sentAt.filter((value) => time - value < 10 * 60_000);
    if (sentAt.length >= 20) return;
    if (recent.has(key) && time - recent.get(key)! < 60_000) return;
    recent.set(key, time);
    sentAt.push(time);
    try {
      void Promise.resolve(
        send({
          client_request_id: crypto.randomUUID(),
          source: "browser",
          code,
          screen: safeScreen,
          ...(statusCode ? { status_code: statusCode } : {}),
          ...(typeof requestId === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            requestId,
          )
            ? { request_id: requestId }
            : {}),
        }),
      ).catch(() => {});
    } catch {
      /* Collection must never interrupt the workspace. */
    }
  };
}

export type SupportIncident = {
  id: string;
  company_id: string | null;
  company_name: string;
  source: string;
  code: string;
  screen: string;
  status_code: number | null;
  request_id: string | null;
  occurrences: number;
  first_seen: string;
  last_seen: string;
};

export const supportScreenLabels: Record<string, string> = {
  overview: "Обзор",
  sales: "Продажи",
  reports: "Отчёты",
  documents: "Документы",
  transfers: "Перемещения",
  writeoffs: "Списания",
  incoming: "Приходные накладные",
  outgoing: "Реализация",
  deposits: "Депозиты",
  management: "Управление",
  profile: "Профиль",
  other: "Другой экран",
};
export const supportCodeLabels: Record<string, string> = {
  browser_error: "Ошибка интерфейса",
  unhandled_rejection: "Ошибка фонового запроса интерфейса",
  api_error: "Ошибка API",
  http_5xx: "Ошибка HTTP на сервере",
  unhandled_exception: "Необработанная ошибка сервера",
  sync_failed: "Ошибка синхронизации",
  document_failed: "Ошибка обработки документа",
};

export function createSupportAttempt() {
  let pending: Parameters<SupportClient["create"]>[0] | null = null;
  return {
    prepare(description: string, path: string) {
      if (!pending)
        pending = Object.freeze({
          client_request_id: crypto.randomUUID(),
          description: description.trim(),
          screen: supportScreen(path),
        });
      return pending;
    },
    reset() {
      pending = null;
    },
  };
}

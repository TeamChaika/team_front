export type Status = "draft" | "active" | "suspended";
export type ConnectionCredential = { login: string; password?: string };
export type ConnectionCheck = {
  status: "not_checked" | "ok" | "failed";
  code: string | null;
  message: string | null;
  checked_at: string | null;
};
export type Connection = {
  id: string;
  url: string;
  login: string | null;
  password_set: boolean;
  check: ConnectionCheck;
};
export type CompanyWrite = {
  connection_credentials?: Record<string, ConnectionCredential>;
  name: string;
  slug: string;
  domain: string | null;
  status: Status;
  primary_admin: { name: string; email: string; phone: string } | null;
  chain_url: string | null;
  rms: { id: string; label: string; url: string; enabled: boolean }[];
  modules: {
    analytics: boolean;
    documents: boolean;
    commercial_invoices: boolean;
    finance: boolean;
    deposits: boolean;
  };
  subscription: {
    plan: string;
    start_date: string | null;
    end_date: string | null;
  };
  notes: string;
};
export type Company = CompanyWrite & {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  subscription_state: "not_set" | "scheduled" | "active" | "expired";
  integration_state: "not_configured" | "not_checked" | "ok" | "failed";
};
export type User = { id: string; username: string; display_name: string };
export type AuditEvent = {
  id: string;
  company_id: string;
  actor: { id: string; display_name: string };
  action: string;
  changed_fields: string[];
  created_at: string;
};
export const statusLabels: Record<Status, string> = {
  draft: "Черновик",
  active: "Активна",
  suspended: "Приостановлена",
};
export const subscriptionLabels = {
  not_set: "Не задана",
  scheduled: "Запланирована",
  active: "Активна",
  expired: "Истекла",
};
export const integrationLabels: Record<Company["integration_state"], string> = {
  not_configured: "Не настроено",
  not_checked: "Не проверено",
  ok: "Авторизация подтверждена",
  failed: "Ошибка соединения",
};
export const moduleLabels: Record<keyof CompanyWrite["modules"], string> = {
  analytics: "Аналитика",
  documents: "Документы",
  commercial_invoices: "Реализация и счета",
  finance: "Финансы",
  deposits: "Депозиты",
};
export const emptyCompany = (): CompanyWrite => ({
  name: "",
  slug: "",
  domain: null,
  status: "draft",
  primary_admin: null,
  chain_url: null,
  rms: [],
  modules: {
    analytics: false,
    documents: false,
    commercial_invoices: false,
    finance: false,
    deposits: false,
  },
  subscription: { plan: "", start_date: null, end_date: null },
  notes: "",
});
export function normalizeCompany(value: CompanyWrite): CompanyWrite {
  const credentials = Object.entries(value.connection_credentials || {})
    .filter(([id]) =>
      id === "chain"
        ? !!value.chain_url?.trim()
        : value.rms.some((r) => r.id === id),
    )
    .map(([id, credential]) => [
      id,
      {
        login: credential.login.trim(),
        ...(credential.password !== undefined && credential.password !== ""
          ? { password: credential.password }
          : {}),
      },
    ]);
  return {
    ...(credentials.length
      ? { connection_credentials: Object.fromEntries(credentials) }
      : {}),
    status: value.status,
    name: value.name.trim(),
    slug: value.slug.trim(),
    domain: value.domain?.trim() || null,
    chain_url: value.chain_url?.trim() || null,
    primary_admin:
      value.primary_admin &&
      Object.values(value.primary_admin).some((v) => v.trim())
        ? {
            name: value.primary_admin.name.trim(),
            email: value.primary_admin.email.trim(),
            phone: value.primary_admin.phone.trim(),
          }
        : null,
    rms: value.rms.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      label: r.label.trim(),
      url: r.url.trim(),
    })),
    modules: {
      analytics: value.modules.analytics,
      documents: value.modules.documents,
      commercial_invoices: value.modules.commercial_invoices,
      finance: value.modules.finance,
      deposits: value.modules.deposits,
    },
    subscription: {
      start_date: value.subscription.start_date,
      end_date: value.subscription.end_date,
      plan: value.subscription.plan.trim(),
    },
    notes: value.notes.trim(),
  };
}
export function validateCompany(value: CompanyWrite): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!value.name.trim()) errors.name = "Укажите название компании";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value.slug))
    errors.slug = "Латинские буквы в нижнем регистре, цифры и дефис";
  if (
    value.subscription.start_date &&
    value.subscription.end_date &&
    value.subscription.end_date < value.subscription.start_date
  )
    errors.end_date = "Окончание должно быть не раньше начала";
  for (const [key, url] of [
    ["chain_url", value.chain_url],
    ...value.rms.map((r, i) => [`rms.${i}.url`, r.url]),
  ] as [string, string | null][]) {
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        errors[key] = "Укажите полный HTTP или HTTPS адрес";
      }
    }
  }
  return errors;
}
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

const auditFieldLabels: Record<string, string> = {
  name: "Название",
  slug: "Идентификатор",
  domain: "Домен",
  status: "Статус регистрации",
  primary_admin: "Контакт администратора",
  chain_url: "Адрес iiko Chain",
  connection_credentials: "Доступы к iiko",
  rms: "Серверы RMS",
  modules: "Модули",
  subscription: "Подписка",
  notes: "Заметки",
  archived_at: "Архивация",
  admin_access: "Доступ администратора",
};
export function auditFieldLabel(field: string): string {
  return auditFieldLabels[field.split(".")[0]] || "Другие данные";
}
export function companyCountLabel(count: number): string {
  const lastTwo = Math.abs(count) % 100;
  const last = Math.abs(count) % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "компаний"
      : last === 1
        ? "компания"
        : last >= 2 && last <= 4
          ? "компании"
          : "компаний";
  return `${count} ${noun}`;
}

export function connectionCredentialError(
  url: string,
  credential: ConnectionCredential,
  stored?: Connection,
): string | null {
  if (!credential.login.trim()) return "Укажите логин iiko";
  if (
    !credential.password &&
    !(
      stored?.password_set &&
      stored.url === url.trim() &&
      stored.login === credential.login.trim()
    )
  )
    return "Укажите пароль для этого адреса и логина";
  return null;
}

export type ConnectionLoadScope = { company_id: string; version: number };
export function connectionLoadMatchesCompany(
  scope: ConnectionLoadScope | null,
  company: Pick<Company, "id" | "version">,
): boolean {
  return (
    !!scope &&
    scope.company_id === company.id &&
    scope.version === company.version
  );
}

export type AdminAccess = {
  company_version: number;
  exists: boolean;
  login_path: string;
  admin: null | {
    id: string;
    username: string;
    display_name: string;
    must_change_password: boolean;
    temporary_expires_at: string | null;
    status: "temporary" | "expired" | "active" | "blocked";
  };
};
export type IssuedAdminAccess = AdminAccess & { temporary_password: string };
export const adminAccessLabels = {
  temporary: "Ожидает смены пароля",
  expired: "Временный пароль истёк",
  active: "Доступ создан",
  blocked: "Вход приостановлен",
};
export const tenantLoginPath = (slug: string) =>
  `/tenant/${encodeURIComponent(slug)}`;
export function tenantSlugFromPath(path: string): string | null {
  const match = /^\/tenant\/([a-z0-9][a-z0-9-]*)\/?$/.exec(path);
  return match?.[1] || null;
}
export function tenantPasswordError(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < 8) return "Пароль должен содержать не менее 8 символов";
  if (password !== confirmation) return "Пароли не совпадают";
  return null;
}

export async function loadAdminAccessSnapshot(
  current: Company,
  loadAccess: () => Promise<AdminAccess>,
  loadCompany: () => Promise<Company>,
): Promise<{ access: AdminAccess; company: Company }> {
  let access = await loadAccess();
  if (access.company_version === current.version)
    return { access, company: current };
  const company = await loadCompany();
  if (company.id !== current.id)
    throw new Error("Компания изменилась. Обновите карточку.");
  if (access.company_version !== company.version) access = await loadAccess();
  if (access.company_version !== company.version)
    throw new Error("Компания изменяется в другой вкладке. Обновите карточку.");
  return { access, company };
}

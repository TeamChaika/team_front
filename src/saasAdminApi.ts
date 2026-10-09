import type { ModuleSettings } from "./companyModuleSettingsModel";
import type { ProvisioningStatus } from "./SaasProvisioning";
import { normalizeCompany } from "./saasAdminModel";
import type {
  AuditEvent,
  Company,
  CompanyWrite,
  User,
  Connection,
  ConnectionCheck,
  AdminAccess,
  IssuedAdminAccess,
} from "./saasAdminModel";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public field?: string,
    public code?: string,
  ) {
    super(message);
  }
}
let csrf = "";
export function setCsrf(token: string) {
  csrf = token;
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/saas-admin${path}`, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      "Не удалось связаться с сервером. Попробуйте ещё раз.",
      0,
    );
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const detail = error?.detail;
    throw new ApiError(
      typeof detail === "string"
        ? detail
        : detail?.message || "Не удалось выполнить запрос",
      response.status,
      detail?.field,
      detail?.code,
    );
  }
  return response.status === 204 ? (undefined as T) : await response.json();
}
export const api = {
  moduleSettings: (id: string, signal?: AbortSignal) =>
    request<ModuleSettings>(
      `/companies/${id}/module-settings`,
      "GET",
      undefined,
      signal,
    ),
  saveModuleSettings: (id: string, body: unknown) =>
    request<ModuleSettings>(`/companies/${id}/module-settings`, "PATCH", body),
  provisioning: (id: string, signal?: AbortSignal) =>
    request<ProvisioningStatus>(
      `/companies/${id}/provisioning`,
      "GET",
      undefined,
      signal,
    ),
  startProvisioning: (id: string, version: number, retry = false) =>
    request<ProvisioningStatus>(
      `/companies/${id}/provisioning/${retry ? "retry" : "start"}`,
      "POST",
      { expected_version: version },
    ),
  me: () => request<{ user: User; csrf_token: string }>("/auth/me"),
  login: (username: string, password: string) =>
    request<{ user: User; csrf_token: string }>("/auth/login", "POST", {
      username,
      password,
    }),
  logout: () => request<void>("/auth/logout", "POST"),
  companies: (q: string, status: string, offset: number) =>
    request<{ items: Company[]; total: number }>(
      `/companies?q=${encodeURIComponent(q)}${status ? `&status=${encodeURIComponent(status)}` : ""}&limit=50&offset=${offset}`,
    ),
  company: (id: string, signal?: AbortSignal) =>
    request<Company>(`/companies/${id}`, "GET", undefined, signal),
  save: (value: CompanyWrite, company?: Company) =>
    company
      ? request<Company>(`/companies/${company.id}`, "PATCH", {
          ...normalizeCompany(value),
          expected_version: company.version,
        })
      : request<Company>("/companies", "POST", normalizeCompany(value)),
  archive: (company: Company) =>
    request<void>(
      `/companies/${company.id}?expected_version=${company.version}`,
      "DELETE",
    ),
  connections: (id: string, signal?: AbortSignal) =>
    request<{ items: Connection[] }>(
      `/companies/${id}/connections`,
      "GET",
      undefined,
      signal,
    ),
  testConnection: (
    id: string,
    connectionId: string,
    version: number,
    signal?: AbortSignal,
  ) =>
    request<{ company_version: number; connection: Connection }>(
      `/companies/${id}/connections/${connectionId}/test`,
      "POST",
      { expected_version: version },
      signal,
    ),
  testDraftConnection: (
    body: {
      url: string;
      login: string;
      password?: string;
      company_id?: string;
      connection_id?: string;
      expected_version?: number;
    },
    signal?: AbortSignal,
  ) => request<ConnectionCheck>("/connections/test", "POST", body, signal),
  adminAccess: (id: string, signal?: AbortSignal) =>
    request<AdminAccess>(
      `/companies/${id}/admin-access`,
      "GET",
      undefined,
      signal,
    ),
  issueAdminAccess: (id: string, version: number, reset = false) =>
    request<IssuedAdminAccess>(
      `/companies/${id}/admin-access${reset ? "/reset" : ""}`,
      "POST",
      { expected_version: version },
    ),
  events: (id: string, offset = 0) =>
    request<{ items: AuditEvent[]; total: number }>(
      `/companies/${id}/events?limit=50&offset=${offset}`,
    ),
};

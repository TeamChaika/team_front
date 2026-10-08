import type { CompanyWrite } from "./saasAdminModel";
export type TenantSession = {
  user: {
    id: string;
    username: string;
    display_name: string;
    company_id: string;
  };
  company: { id: string; name: string; slug: string };
  must_change_password: boolean;
  csrf_token: string;
};
export type TenantWorkspace = {
  company: {
    id: string;
    name: string;
    slug: string;
    modules: CompanyWrite["modules"];
  };
  admin: { id: string; username: string; display_name: string };
  mode: "local" | "production";
  business_modules_ready: boolean;
};
export class TenantApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function createTenantApi(slug: string) {
  let csrf = "";
  let sessionGeneration = 0;
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(
        `/api/saas-tenant/${encodeURIComponent(slug)}${path}`,
        {
          method,
          credentials: "same-origin",
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
    } catch {
      throw new TenantApiError(
        "Не удалось связаться с сервером. Попробуйте ещё раз.",
        0,
      );
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => null))?.detail;
      throw new TenantApiError(
        typeof detail === "string"
          ? detail
          : detail?.message || "Не удалось выполнить запрос",
        response.status,
        detail?.code,
      );
    }
    return response.status === 204 ? (undefined as T) : response.json();
  }
  async function session(path: string, method = "GET", body?: unknown) {
    const generation = ++sessionGeneration;
    const data = await request<TenantSession>(path, method, body);
    if (generation === sessionGeneration) csrf = data.csrf_token;
    return data;
  }
  return {
    me: () => session("/auth/me"),
    login: (username: string, password: string) =>
      session("/auth/login", "POST", { username, password }),
    password: (current_password: string, new_password: string) =>
      session("/auth/password", "POST", { current_password, new_password }),
    logout: async () => {
      ++sessionGeneration;
      try {
        await request<void>("/auth/logout", "POST");
      } catch (error) {
        if (!(error instanceof TenantApiError) || error.status !== 401)
          throw error;
      }
      csrf = "";
    },
    workspace: () => request<TenantWorkspace>("/workspace"),
  };
}

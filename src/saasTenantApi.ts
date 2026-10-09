import type {
  PaymentDomainSettings,
  PaymentDomainWrite,
} from "./paymentDomainModel.ts";
import type {
  CompanyIntegrations,
  CompanyIntegrationsWrite,
} from "./companyIntegrationsModel.ts";
import {
  tenantMutationReady,
  tenantHistoryRequest,
  tenantOwnerSetupMutation,
  type FeatureReadiness,
} from "./tenantFeatureReadiness.ts";
import {
  serializeTenantReports,
  fullPortalPathAllowed,
  fullDashboardPageAllowed,
  type DashboardRuntime,
} from "./dashboardRuntime.ts";
import { isTenantRecoveryPage } from "./tenantRecoveryRequest.ts";
import { tenantSlugFromPath, type CompanyWrite } from "./saasAdminModel.ts";
import {
  parseGuestDepositRoute,
  type GuestDepositRoute,
} from "./tenantGuestPayment.ts";

export type SaasContext = {
  full_dashboard_ready?: boolean;
  working_dashboard_available?: boolean;
  feature_readiness?: FeatureReadiness;
  full_dashboard_available?: boolean;
  setup_available?: boolean;
  platform_origin?: string;
  surface: "platform" | "tenant" | "payment";
  payment_origin?: string;
  api_origin?: string;
  company: null | { id: string; slug: string; name: string; timezone?: string };
};
export type SaasEntry =
  | { surface: "platform" }
  | {
      surface: "tenant";
      slug: string;
      companyName?: string;
      timezone?: string;
      companyId?: string;
      platformOrigin?: string;
      fullDashboardReady?: boolean;
      workingDashboardAvailable?: boolean;
      featureReadiness?: FeatureReadiness;
      fullDashboardAvailable?: boolean;
      setupAvailable?: boolean;
      guestDeposit?: GuestDepositRoute;
      guestOnly?: boolean;
      guestApiOrigin?: string;
    }
  | { surface: "denied" };
export async function loadSaasContext(
  apiOrigin = "",
  publicGuest = false,
): Promise<SaasContext> {
  const response = await fetch(apiOrigin + "/api/saas-context", {
    credentials: publicGuest ? "omit" : apiOrigin ? "include" : "same-origin",
    referrerPolicy: "no-referrer",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Этот адрес не подключён к RestControl.");
  const context: SaasContext = await response.json();
  if (context.surface === "platform" && context.company === null)
    return context;
  if (
    ["tenant", "payment"].includes(context.surface) &&
    context.company &&
    typeof context.company.id === "string" &&
    typeof context.company.name === "string" &&
    typeof context.company.slug === "string" &&
    tenantSlugFromPath(`/tenant/${context.company.slug}`) ===
      context.company.slug
  )
    return context;
  throw new Error("Не удалось определить компанию для этого адреса.");
}
export function resolveSaasEntry(
  context: SaasContext,
  path: string,
  search = "",
): SaasEntry {
  const slug = tenantSlugFromPath(path);
  const guestDeposit = parseGuestDepositRoute(path, search);
  if (context.surface === "tenant" || context.surface === "payment") {
    if (context.surface === "payment" && !guestDeposit)
      return { surface: "denied" };
    if (
      !context.company ||
      (path !== "/" &&
        path !== "/sales" &&
        slug !== context.company.slug &&
        !isTenantRecoveryPage(path) &&
        guestDeposit === null &&
        !(
          context.setup_available === true &&
          ["/management", "/profile"].includes(path)
        ) &&
        !(
          (context.working_dashboard_available === true ||
            context.full_dashboard_ready === true ||
            context.full_dashboard_available === true) &&
          fullDashboardPageAllowed(path)
        ))
    )
      return { surface: "denied" };
    return {
      surface: "tenant",
      slug: context.company.slug,
      ...(context.surface === "payment" ? { guestOnly: true } : {}),
      companyName: context.company.name,
      ...(typeof context.company.timezone === "string"
        ? { timezone: context.company.timezone }
        : {}),
      ...(guestDeposit ? { guestDeposit } : {}),
      ...(context.working_dashboard_available === true
        ? { workingDashboardAvailable: true }
        : {}),
      ...(context.feature_readiness !== undefined
        ? { featureReadiness: context.feature_readiness }
        : {}),
      ...(context.full_dashboard_ready === true
        ? { fullDashboardReady: true }
        : {}),
      ...(context.full_dashboard_available === true
        ? { fullDashboardAvailable: true }
        : {}),
      ...(context.setup_available === true ? { setupAvailable: true } : {}),
      ...(context.platform_origin
        ? {
            companyId: context.company.id,
            platformOrigin: context.platform_origin,
          }
        : {}),
    };
  }
  if (path.startsWith("/tenant/"))
    return slug ? { surface: "tenant", slug } : { surface: "denied" };
  return { surface: "platform" };
}
export type TenantSession = {
  can_manage_integrations?: boolean;
  actor?: {
    kind: "platform_owner" | "company_member";
    auth_user_id: string;
    company_id: string;
  };
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
  setup_available?: boolean;
  full_dashboard_available?: boolean;
  full_dashboard_ready?: boolean;
  working_dashboard_available?: boolean;
  feature_readiness?: FeatureReadiness;
};
export class TenantApiError extends Error {
  status: number;
  code?: string;
  detail?: unknown;
  constructor(
    message: string,
    status: number,
    code?: string,
    detail?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
export function createTenantApi(slug: string, apiOrigin = "") {
  if (apiOrigin) {
    const origin = new URL(apiOrigin);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== apiOrigin ||
      origin.username ||
      origin.password
    )
      throw new Error("Неверный адрес API компании");
  }
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
        `${apiOrigin}/api/saas-tenant/${encodeURIComponent(slug)}${path}`,
        {
          method,
          credentials: apiOrigin ? "include" : "same-origin",
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
    dashboardRuntime: (
      onSessionLost: () => void,
      onPasswordRequired: () => void,
      fullDashboard = false,
      featureReadiness?: FeatureReadiness,
      historyReadOnly = false,
      ownerSetupAvailable = false,
    ): DashboardRuntime => ({
      fullDashboard,
      featureReadiness,
      paymentDomainSettings: () =>
        request<PaymentDomainSettings>("/payment-domain"),
      savePaymentDomainSettings: (body: PaymentDomainWrite) =>
        request<PaymentDomainSettings>("/payment-domain", "POST", body),
      integrationSettings: () => request<CompanyIntegrations>("/integrations"),
      saveIntegrationSettings: (body: CompanyIntegrationsWrite) =>
        request<CompanyIntegrations>("/integrations", "POST", body),
      request: serializeTenantReports(async (path, init = {}) => {
        if (
          fullDashboard
            ? !fullPortalPathAllowed(path) ||
              !["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].includes(
                init.method || "GET",
              )
            : !/^\/(me|overview|sales\/(daily|dishes))(\?|$)/.test(path) ||
              (init.method && init.method !== "GET")
        )
          throw new TenantApiError(
            "Раздел ещё не подключён для этой компании",
            403,
          );
        const method = init.method || "GET";
        const ownerConfiguration =
          ownerSetupAvailable && tenantOwnerSetupMutation(path, method);
        if (
          (historyReadOnly && !tenantHistoryRequest(path, method)) ||
          (!ownerConfiguration &&
            !tenantMutationReady(featureReadiness, path, method))
        )
          throw new TenantApiError(
            "Для этого действия нужно завершить настройку раздела.",
            403,
            "feature_setup_required",
          );
        const response = await fetch(
          fullDashboard
            ? `${apiOrigin}/api${path}`
            : `${apiOrigin}/api/saas-tenant/${encodeURIComponent(slug)}/dashboard${path}`,
          {
            ...init,
            credentials: apiOrigin ? "include" : "same-origin",
            redirect: "error",
            headers: {
              "Content-Type": "application/json",
              ...Object.fromEntries(new Headers(init.headers).entries()),
              ...(fullDashboard &&
              !["GET", "HEAD"].includes(init.method || "GET")
                ? { "X-CSRF-Token": csrf }
                : {}),
            },
          },
        );
        init.signal?.throwIfAborted();
        if (
          fullDashboard &&
          path === "/profile/password" &&
          [200, 503].includes(response.status)
        ) {
          const update = await response
            .clone()
            .json()
            .catch(() => null);
          if (
            typeof update?.csrf_token === "string" &&
            update.csrf_token.length > 0
          ) {
            // Password changes rotate the opaque cookie, including partial success.
            // Prevent an older in-flight session read from restoring its old CSRF.
            ++sessionGeneration;
            csrf = update.csrf_token;
          }
        }
        if (!response.ok) {
          const detail = (await response.json().catch(() => null))?.detail;
          if (response.status === 401) onSessionLost();
          if (detail?.code === "password_change_required") onPasswordRequired();
          throw new TenantApiError(
            typeof detail === "string"
              ? detail
              : detail?.message || "Не удалось получить данные компании",
            response.status,
            detail?.code,
            detail,
          );
        }
        if (
          fullDashboard &&
          path.split("?")[0] === "/me" &&
          featureReadiness !== undefined
        ) {
          const latest = await response
            .clone()
            .json()
            .catch(() => null);
          featureReadiness = latest?.feature_readiness ?? {};
        }
        return response;
      }),
      renew: async () => {
        try {
          const data = await session("/auth/me");
          if (data.must_change_password) onPasswordRequired();
          return new Response(null, { status: 204 });
        } catch (error) {
          if (error instanceof TenantApiError && error.status === 401)
            onSessionLost();
          throw error;
        }
      },
    }),
  };
}

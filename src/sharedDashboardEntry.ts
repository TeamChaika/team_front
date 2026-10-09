import {
  loadSaasContext,
  resolveSaasEntry,
  type SaasEntry,
} from "./saasTenantApi.ts";

import { parseGuestDepositRoute } from "./tenantGuestPayment.ts";

import { isTenantRecoveryPage } from "./tenantRecoveryRequest.ts";

export type DashboardHost =
  | { surface: "primary" }
  | { surface: "tenant"; apiOrigin: string };
export function dashboardHost(
  origin: string,
  primaryOrigins: string,
  development = false,
): DashboardHost {
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password)
    throw new Error("Некорректный адрес рабочего пространства");
  if (development && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    return { surface: "primary" };
  const trusted = primaryOrigins
    .split(",")
    .map((value) => value.trim())
    .filter((value) => {
      try {
        const candidate = new URL(value);
        return (
          candidate.protocol === "https:" &&
          candidate.origin === value &&
          !candidate.username &&
          !candidate.password
        );
      } catch {
        return false;
      }
    });
  if (trusted.includes(origin)) return { surface: "primary" };
  if (url.protocol !== "https:" || url.port)
    throw new Error("Этот адрес не подключён к рабочему пространству");
  return { surface: "tenant", apiOrigin: `https://api.${url.hostname}` };
}
export function validateTenantApiOrigin(
  origin: string,
  apiOrigin: string,
): string {
  const expected = dashboardHost(origin, "");
  if (expected.surface !== "tenant" || expected.apiOrigin !== apiOrigin)
    throw new Error("Неверный адрес API компании");
  return apiOrigin;
}
export async function loadSharedTenantEntry(
  origin: string,
  apiOrigin: string,
  path: string,
  search = "",
): Promise<SaasEntry> {
  validateTenantApiOrigin(origin, apiOrigin);
  const context = await loadSaasContext(
    apiOrigin,
    parseGuestDepositRoute(path, search) !== null || isTenantRecoveryPage(path),
  );
  if (context.surface !== "tenant")
    throw new Error("Этот адрес не подключён к компании");
  const entry = resolveSaasEntry(context, path, search);
  if (entry.surface !== "tenant")
    throw new Error("Страница компании не найдена");
  return entry;
}

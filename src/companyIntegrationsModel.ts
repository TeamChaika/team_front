import {
  moduleSettingsWrite,
  type ModuleSettings,
} from "./companyModuleSettingsModel.ts";
export type CompanyIntegrations = Pick<
  ModuleSettings,
  "company_version" | "telegram" | "assistant"
> & {
  integrations_revision: number;
  missing: { telegram: boolean; assistant: boolean };
  apply_status?: "pending" | "applied" | "failed";
  error_code?: string | null;
};
export function companyIntegrationsWrite(
  settings: CompanyIntegrations,
  token: string,
  clearToken: boolean,
  key: string,
  clearKey: boolean,
) {
  const { seller: _seller, ...write } = moduleSettingsWrite(
    {
      ...settings,
      seller: null,
      missing: { ...settings.missing, seller: true },
    },
    null,
    token,
    clearToken,
    key,
    clearKey,
  );
  write.telegram.username = write.telegram.username.trim().replace(/^@/, "");
  write.assistant.model = write.assistant.model.trim();
  write.assistant.agent_id =
    write.assistant.provider === "timeweb"
      ? write.assistant.agent_id?.trim() || null
      : null;
  return { ...write, expected_revision: settings.integrations_revision };
}
export type CompanyIntegrationsWrite = ReturnType<
  typeof companyIntegrationsWrite
>;
export function companyIntegrationsAllowed(
  tenant: boolean,
  capability: unknown,
) {
  return tenant && capability === true;
}

export function integrationApplyNotice(
  status: CompanyIntegrations["apply_status"],
) {
  if (status === "applied") return "Настройки сохранены и применены.";
  if (status === "failed")
    return "Настройки сохранены, но применить их не удалось. Проверьте имя и токен Telegram-бота.";
  return "Настройки сохранены. Применение выполняется автоматически.";
}
export function matchingIntegrationRevision(
  saved: CompanyIntegrations,
  latest: CompanyIntegrations,
) {
  return (
    saved.company_version === latest.company_version &&
    saved.integrations_revision === latest.integrations_revision
  );
}

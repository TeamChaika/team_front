export type Seller = Record<
  | "name"
  | "inn"
  | "kpp"
  | "address"
  | "phone"
  | "bank_name"
  | "bic"
  | "account"
  | "correspondent_account",
  string
>;
export type ModuleSettings = {
  company_version: number;
  integrations_revision?: number;
  seller: Seller | null;
  telegram: { username: string; token_configured: boolean };
  assistant: {
    provider: "openai" | "openrouter" | "timeweb";
    model: string;
    agent_id: string | null;
    key_configured: boolean;
  };
  missing: { seller: boolean; telegram: boolean; assistant: boolean };
};
export function moduleSettingsWrite(
  settings: ModuleSettings,
  seller: Seller | null,
  token: string,
  clearToken: boolean,
  key: string,
  clearKey: boolean,
) {
  if ((token.trim() && clearToken) || (key.trim() && clearKey))
    throw new Error("Нельзя одновременно заменить и удалить секрет");
  return {
    expected_version: settings.company_version,
    ...(settings.integrations_revision !== undefined
      ? { expected_revision: settings.integrations_revision }
      : {}),
    seller,
    telegram: {
      username: settings.telegram.username,
      ...(token.trim() ? { token: token.trim() } : {}),
      clear_token: clearToken,
    },
    assistant: {
      provider: settings.assistant.provider,
      model: settings.assistant.model,
      agent_id: settings.assistant.agent_id || null,
      ...(key.trim() ? { key: key.trim() } : {}),
      clear_key: clearKey,
    },
  };
}

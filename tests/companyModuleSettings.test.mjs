import test from "node:test";
import assert from "node:assert/strict";
import { moduleSettingsWrite } from "../src/companyModuleSettingsModel.ts";
const settings = {
  company_version: 8,
  seller: null,
  telegram: { username: "OwnBot", token_configured: true },
  assistant: {
    provider: "openai",
    model: "own-model",
    agent_id: null,
    key_configured: true,
  },
  missing: { seller: true, telegram: false, assistant: false },
};
test("blank secret fields preserve stored credentials and send no read-side flags", () => {
  const result = moduleSettingsWrite(settings, null, "", false, "  ", false);
  assert.equal(result.expected_version, 8);
  assert.equal(result.seller, null);
  assert.equal("token" in result.telegram, false);
  assert.equal("key" in result.assistant, false);
  assert.equal("key_configured" in result.assistant, false);
  assert.equal("token_configured" in result.telegram, false);
});
test("explicit clearing is distinct from leaving a key unchanged", () => {
  const result = moduleSettingsWrite(settings, null, "", true, "", true);
  assert.equal(result.telegram.clear_token, true);
  assert.equal(result.assistant.clear_key, true);
  assert.throws(() =>
    moduleSettingsWrite(settings, null, "new-secret", true, "", false),
  );
  assert.throws(() =>
    moduleSettingsWrite(settings, null, "", false, "new-secret", true),
  );
});
test("own provider and agent metadata preserve the optimistic version", () => {
  const result = moduleSettingsWrite(
    {
      ...settings,
      assistant: {
        ...settings.assistant,
        provider: "timeweb",
        agent_id: "00000000-0000-0000-0000-000000000001",
      },
    },
    null,
    " token ",
    false,
    " key ",
    false,
  );
  assert.equal(result.assistant.provider, "timeweb");
  assert.equal(
    result.assistant.agent_id,
    "00000000-0000-0000-0000-000000000001",
  );
  assert.equal(result.assistant.key, "key");
  assert.equal(result.telegram.token, "token");
});
test("owner settings pin integrations revision to reject concurrent leader changes", () => {
  const result = moduleSettingsWrite(
    { ...settings, integrations_revision: 12 },
    null,
    "",
    false,
    "",
    false,
  );
  assert.equal(result.expected_revision, 12);
  assert.equal(result.expected_version, settings.company_version);
});

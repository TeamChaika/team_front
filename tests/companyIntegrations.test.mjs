import test from "node:test";
import assert from "node:assert/strict";
import {
  companyIntegrationsAllowed,
  companyIntegrationsWrite,
} from "../src/companyIntegrationsModel.ts";
import { createTenantApi } from "../src/saasTenantApi.ts";
const settings = {
  company_version: 3,
  integrations_revision: 7,
  telegram: { username: "@CompanyBot", token_configured: true },
  assistant: {
    provider: "openai",
    model: "gpt",
    agent_id: "old-agent",
    key_configured: true,
  },
  missing: { telegram: false, assistant: false },
};
test("integration UI requires explicit server capability and tenant context", () => {
  assert.equal(companyIntegrationsAllowed(true, true), true);
  for (const capability of [false, undefined, null, "true", 1])
    assert.equal(companyIntegrationsAllowed(true, capability), false);
  assert.equal(companyIntegrationsAllowed(false, true), false);
});
test("self-service excludes seller and read-side secret flags; blank preserves secrets", () => {
  const write = companyIntegrationsWrite(settings, "", false, " ", false);
  assert.equal(write.expected_version, 3);
  assert.equal(write.expected_revision, 7);
  assert.equal(write.telegram.username, "CompanyBot");
  assert.equal("seller" in write, false);
  assert.equal("token" in write.telegram, false);
  assert.equal("key" in write.assistant, false);
  assert.equal("token_configured" in write.telegram, false);
  assert.equal("key_configured" in write.assistant, false);
  assert.equal(write.assistant.agent_id, null);
});
test("explicit removal conflicts with replacement; Timeweb keeps its own agent ID", () => {
  assert.throws(() =>
    companyIntegrationsWrite(settings, "token", true, "", false),
  );
  assert.throws(() =>
    companyIntegrationsWrite(settings, "", false, "key", true),
  );
  const write = companyIntegrationsWrite(
    { ...settings, assistant: { ...settings.assistant, provider: "timeweb" } },
    "",
    true,
    "",
    true,
  );
  assert.equal(write.telegram.clear_token, true);
  assert.equal(write.assistant.clear_key, true);
  assert.equal(write.assistant.agent_id, "old-agent");
});
test("tenant integration requests use own cookie + rotated CSRF without module readiness deadlock", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, init) => {
    calls.push({ path, init });
    return new Response(
      JSON.stringify(
        path.endsWith("/auth/me") ? { csrf_token: "tenant-only" } : settings,
      ),
      { status: 200 },
    );
  });
  const api = createTenantApi("company-a", "https://api.company.test");
  await api.me();
  const runtime = api.dashboardRuntime(
    () => {},
    () => {},
    true,
    {},
    true,
  );
  await runtime.integrationSettings();
  await runtime.saveIntegrationSettings(
    companyIntegrationsWrite(settings, "new-token", false, "", false),
  );
  assert.equal(
    calls[1].path,
    "https://api.company.test/api/saas-tenant/company-a/integrations",
  );
  assert.equal(calls[2].init.method, "POST");
  assert.equal(calls[2].init.headers["X-CSRF-Token"], "tenant-only");
  assert.equal(calls[2].init.credentials, "include");
  assert.equal(JSON.parse(calls[2].init.body).expected_revision, 7);
});
test("application notice distinguishes saved, pending and failed; polling pins both revisions", async () => {
  const { integrationApplyNotice, matchingIntegrationRevision } = await import(
    "../src/companyIntegrationsModel.ts"
  );
  assert.match(integrationApplyNotice("pending"), /автоматически/);
  assert.match(integrationApplyNotice("applied"), /применены/);
  assert.match(integrationApplyNotice("failed"), /не удалось/);
  assert.equal(
    matchingIntegrationRevision(settings, {
      ...settings,
      apply_status: "applied",
    }),
    true,
  );
  assert.equal(
    matchingIntegrationRevision(settings, {
      ...settings,
      integrations_revision: 8,
    }),
    false,
  );
  assert.equal(
    matchingIntegrationRevision(settings, { ...settings, company_version: 4 }),
    false,
  );
});

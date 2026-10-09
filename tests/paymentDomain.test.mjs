import test from "node:test";
import assert from "node:assert/strict";
import { paymentDomainWrite } from "../src/paymentDomainModel.ts";
import { createTenantApi } from "../src/saasTenantApi.ts";
const settings = {
  company_version: 3,
  revision: 4,
  domain: null,
  status: "unconfigured",
  payment_origin: null,
};
test("payment domain command uses its own revision and exact hostname", () => {
  assert.deepEqual(paymentDomainWrite(settings, " PAY.Example.RU "), {
    expected_version: 3,
    expected_revision: 4,
    domain: "pay.example.ru",
  });
  assert.equal(paymentDomainWrite(settings, " ").domain, null);
  for (const domain of [
    "https://pay.example.ru",
    "pay.example.ru/path",
    "user@pay.example.ru",
    "pay.example.ru:443",
    "*.example.ru",
    "localhost",
    "a..ru",
    "-pay.example.ru",
  ])
    assert.throws(() => paymentDomainWrite(settings, domain));
});
test("domain settings use tenant session and CSRF independently of module readiness", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify(
        url.endsWith("/auth/me") ? { csrf_token: "tenant-only" } : settings,
      ),
    );
  });
  const api = createTenantApi("company-a", "https://api.company.test");
  await api.me();
  const runtime = api.dashboardRuntime(
    () => {},
    () => {},
  );
  await runtime.paymentDomainSettings();
  await runtime.savePaymentDomainSettings(
    paymentDomainWrite(settings, "pay.example.ru"),
  );
  assert.equal(
    calls[1].url,
    "https://api.company.test/api/saas-tenant/company-a/payment-domain",
  );
  assert.equal(calls[2].init.credentials, "include");
  assert.equal(calls[2].init.headers["X-CSRF-Token"], "tenant-only");
  assert.equal(JSON.parse(calls[2].init.body).expected_revision, 4);
});

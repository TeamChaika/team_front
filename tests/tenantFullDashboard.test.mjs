import test from "node:test";
import assert from "node:assert/strict";
import { createTenantApi, resolveSaasEntry } from "../src/saasTenantApi.ts";
import {
  fullPortalPathAllowed,
  tenantSections,
} from "../src/dashboardRuntime.ts";

test("full portal uses exact company origin and current tenant CSRF on mutations", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify(
        url.endsWith("/auth/me") ? { csrf_token: "current-token" } : {},
      ),
    );
  });
  const api = createTenantApi("company-a", "https://api.customer.example");
  await api.me();
  const adapter = api.dashboardRuntime(
    () => assert.fail("lost"),
    () => assert.fail("password"),
    true,
  );
  await adapter.request("/commercial-invoices/outgoing", {
    method: "POST",
    headers: { "X-CSRF-Token": "caller-token" },
    body: '{"synthetic":true}',
  });
  await adapter.request("/resources/products?limit=20");
  assert.equal(
    calls[1].url,
    "https://api.customer.example/api/commercial-invoices/outgoing",
  );
  assert.equal(calls[1].init.headers["X-CSRF-Token"], "current-token");
  assert.equal(calls[1].init.credentials, "include");
  assert.equal(calls[1].init.redirect, "error");
  assert.equal(calls[1].init.body, '{"synthetic":true}');
  assert.equal(adapter.fullDashboard, true);
});

test("full adapter refuses SaaS, cross-tenant, auth and path bypasses", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("unsafe fetch"));
  const api = createTenantApi("company-a");
  const adapter = api.dashboardRuntime(
    () => {},
    () => {},
    true,
  );
  for (const path of [
    "/saas-admin/companies",
    "/saas-tenant/company-b/dashboard/me",
    "/auth/login",
    "//evil.example/me",
    "https://evil.example/me",
    "/resources/../saas-admin/companies",
    "/resources/%2e%2e/saas-admin",
    "/resources\\..\\saas-admin",
    "/unknown",
  ]) {
    assert.equal(fullPortalPathAllowed(path), false, path);
    await assert.rejects(adapter.request(path));
  }
  await assert.rejects(adapter.request("/profile", { method: "CONNECT" }));
});

for (const status of [200, 503]) {
  test(`password response ${status} rotates CSRF and defeats an older session response`, async (t) => {
    let releaseOldSession;
    let sessionReads = 0;
    const mutationTokens = [];
    t.mock.method(globalThis, "fetch", async (url, init) => {
      if (url.endsWith("/auth/me")) {
        sessionReads += 1;
        if (sessionReads === 1)
          return Response.json({ csrf_token: "old-token" });
        return new Promise((resolve) => {
          releaseOldSession = () =>
            resolve(Response.json({ csrf_token: "stale-token" }));
        });
      }
      mutationTokens.push(init.headers["X-CSRF-Token"]);
      if (url.endsWith("/profile/password"))
        return Response.json({ csrf_token: "rotated-token" }, { status });
      return Response.json({});
    });
    const api = createTenantApi("company-a");
    await api.me();
    const oldRead = api.me();
    await Promise.resolve();
    const adapter = api.dashboardRuntime(
      () => {},
      () => {},
      true,
    );
    const change = adapter.request("/profile/password", {
      method: "POST",
      body: "{}",
    });
    if (status === 200) await change;
    else await assert.rejects(change, (error) => error.status === 503);
    releaseOldSession();
    await oldRead;
    await adapter.request("/profile/telegram-link", { method: "POST" });
    assert.deepEqual(mutationTokens, ["old-token", "rotated-token"]);
  });
}

test("full UI mode is explicitly server ready, assigned sections preserve server scope", () => {
  const context = {
    surface: "tenant",
    company: { id: "company-id", slug: "company-a", name: "Company" },
  };
  assert.equal(resolveSaasEntry(context, "/management").surface, "denied");
  assert.equal(
    resolveSaasEntry({ ...context, full_dashboard_ready: true }, "/management")
      .fullDashboardReady,
    true,
  );
  const existing = resolveSaasEntry(
    { ...context, full_dashboard_ready: false, full_dashboard_available: true },
    "/management",
  );
  assert.equal(existing.surface, "tenant");
  assert.equal(existing.fullDashboardAvailable, true);
  assert.equal(existing.fullDashboardReady, undefined);
  assert.equal(
    resolveSaasEntry({ ...context, full_dashboard_ready: true }, "/saas-admin")
      .surface,
    "denied",
  );
  assert.deepEqual(
    tenantSections(["overview", "management", "documents"], true),
    ["overview", "management", "documents"],
  );
  assert.deepEqual(tenantSections(["overview", "management", "documents"]), [
    "overview",
  ]);
});

test("working dashboard opens all known routes without all optional integrations", () => {
  const readiness = {
    "analytics.overview": {
      state: "ready",
      read: true,
      write: false,
      reasons: [],
    },
    "assistant.chat": {
      state: "blocked",
      read: false,
      write: false,
      reasons: ["ai_config"],
    },
  };
  const entry = resolveSaasEntry(
    {
      surface: "tenant",
      company: { id: "company", slug: "working", name: "Working" },
      working_dashboard_available: true,
      feature_readiness: readiness,
      full_dashboard_ready: false,
    },
    "/invoices",
  );
  assert.equal(entry.surface, "tenant");
  assert.equal(entry.workingDashboardAvailable, true);
  assert.deepEqual(entry.featureReadiness, readiness);
  assert.equal(entry.fullDashboardReady, undefined);
});

test("partial readiness preserves reads and blocks writes to unknown or blocked features", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return Response.json({});
  });
  const readiness = {
    "analytics.overview": {
      state: "ready",
      read: true,
      write: false,
      reasons: [],
    },
    "commercial.incoming": {
      state: "ready",
      read: true,
      write: true,
      reasons: [],
    },
    "documents.waybills": {
      state: "ready",
      read: true,
      write: true,
      reasons: [],
    },
    "documents.approval": {
      state: "ready",
      read: true,
      write: true,
      reasons: [],
    },
    "documents.dispatch": {
      state: "blocked",
      read: true,
      write: false,
      reasons: ["worker"],
    },
  };
  const adapter = createTenantApi("working").dashboardRuntime(
    () => {},
    () => {},
    true,
    readiness,
  );
  await adapter.request("/overview");
  await adapter.request("/commercial-invoices/incoming", { method: "POST" });
  for (const path of [
    "/assistant/chat",
    "/profile/password",
    "/documents/waybill/id/receive",
    "/commercial-invoices/incoming/counterparties",
  ]) {
    await assert.rejects(
      adapter.request(path, { method: "POST" }),
      (error) => error.code === "feature_setup_required",
    );
  }
  assert.equal(calls.length, 2);
});

test("authenticated me refresh closes mutations if current readiness is removed", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ feature_readiness: {} }),
  );
  const adapter = createTenantApi("working").dashboardRuntime(
    () => {},
    () => {},
    true,
    {
      "profile.account": {
        state: "ready",
        read: true,
        write: true,
        reasons: [],
      },
    },
  );
  await adapter.request("/me");
  await assert.rejects(
    adapter.request("/profile/password", { method: "POST" }),
    (error) => error.status === 403,
  );
});

test("history fallback remains readable but never permits new mutations", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const adapter = createTenantApi("history").dashboardRuntime(
    () => {},
    () => {},
    true,
    undefined,
    true,
  );
  await adapter.request("/commercial-invoices/outgoing");
  await assert.rejects(
    adapter.request("/commercial-invoices/outgoing", { method: "POST" }),
    (error) => error.code === "feature_setup_required",
  );
});

test("report POST requests use read readiness without permitting mutations", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return Response.json({});
  });
  const readiness = {
    "analytics.indicators": {
      state: "ready",
      read: true,
      write: false,
      reasons: [],
    },
    "analytics.sales": {
      state: "ready",
      read: true,
      write: false,
      reasons: [],
    },
  };
  const adapter = createTenantApi("working").dashboardRuntime(
    () => {},
    () => {},
    true,
    readiness,
  );
  for (const path of [
    "/discount-details",
    "/indicators/query",
    "/indicators/metric/revenue",
    "/indicators/options/payment",
  ])
    await adapter.request(path, { method: "POST" });
  await assert.rejects(
    adapter.request("/indicators/unknown", { method: "POST" }),
  );
  assert.equal(calls.length, 4);
  const history = createTenantApi("history").dashboardRuntime(
    () => {},
    () => {},
    true,
    readiness,
    true,
  );
  await history.request("/indicators/query", { method: "POST" });
});

test("owner setup bypass is limited to exact configuration routes", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return Response.json({});
  });
  const owner = createTenantApi("working").dashboardRuntime(
    () => {},
    () => {},
    true,
    {},
    false,
    true,
  );
  const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await owner.request(`/management/venues/${uuid}`, { method: "POST" });
  await owner.request(
    `/payment-settings/venues/${uuid}/terminals/${uuid}/validate`,
    { method: "POST" },
  );
  await assert.rejects(
    owner.request("/management/accounts", { method: "POST" }),
  );
  await assert.rejects(
    owner.request(
      `/payment-settings/venues/${uuid}/terminals/${uuid}/unknown`,
      { method: "POST" },
    ),
  );
  const member = createTenantApi("working").dashboardRuntime(
    () => {},
    () => {},
    true,
    {},
  );
  await assert.rejects(
    member.request(`/management/venues/${uuid}`, { method: "POST" }),
  );
  assert.equal(calls.length, 2);
});

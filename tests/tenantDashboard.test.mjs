import { test } from "node:test";
import assert from "node:assert/strict";
import { createTenantApi, resolveSaasEntry } from "../src/saasTenantApi.ts";
import {
  installDashboardRuntime,
  getDashboardRuntime,
  tenantSections,
} from "../src/dashboardRuntime.ts";

test("tenant dashboard confines requests to same-origin ready routes and preserves abort", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response("{}");
  });
  const api = createTenantApi("company-a");
  const adapter = api.dashboardRuntime(
    () => assert.fail("lost"),
    () => assert.fail("password"),
  );
  const signal = new AbortController().signal;
  await adapter.request("/me", { signal });
  await adapter.request(
    "/overview?department_id=own&start=2026-10-08&end=2026-10-08",
  );
  await adapter.request("/sales/dishes?dish_name=test");
  for (const path of [
    "/auth/refresh",
    "/profile",
    "/purchase-prices",
    "/sales/payments",
    "/me/other",
    "https://xx.chaika.team/me",
    "/../me",
  ])
    await assert.rejects(adapter.request(path));
  await assert.rejects(adapter.request("/me", { method: "POST" }));
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "/api/saas-tenant/company-a/dashboard/me");
  assert.equal(calls[0].init.signal, signal);
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.deepEqual(
    tenantSections(["overview", "sales", "profile", "management", "deposits"]),
    ["overview", "sales"],
  );
});
test("expired dashboard session returns to tenant auth without main auth calls", async (t) => {
  let lost = 0,
    password = 0;
  const paths = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    paths.push(path);
    return new Response(JSON.stringify({ detail: "expired" }), { status: 401 });
  });
  const adapter = createTenantApi("own").dashboardRuntime(
    () => lost++,
    () => password++,
  );
  await assert.rejects(adapter.request("/me"));
  await assert.rejects(adapter.renew());
  assert.equal(lost, 2);
  assert.equal(password, 0);
  assert.deepEqual(paths, [
    "/api/saas-tenant/own/dashboard/me",
    "/api/saas-tenant/own/auth/me",
  ]);
});
test("runtime cleanup cannot remove replacement and requests retain their own adapter", async () => {
  const old = {
    request: async () => new Response("old"),
    renew: async () => new Response(),
  };
  const next = {
    request: async () => new Response("next"),
    renew: async () => new Response(),
  };
  const disposeOld = installDashboardRuntime(old);
  const captured = getDashboardRuntime();
  const disposeNext = installDashboardRuntime(next);
  disposeOld();
  assert.equal(getDashboardRuntime(), next);
  assert.equal(await (await captured.request("/me")).text(), "old");
  disposeNext();
  assert.equal(getDashboardRuntime(), null);
});
test("client-domain sales reload preserves own company and closes other service paths", () => {
  const context = {
    surface: "tenant",
    company: { id: "own", slug: "own", name: "Company" },
  };
  assert.equal(resolveSaasEntry(context, "/sales").slug, "own");
  for (const path of ["/saas-admin", "/tenant/other", "/profile"])
    assert.equal(resolveSaasEntry(context, path).surface, "denied");
});

import {
  dashboardHost,
  validateTenantApiOrigin,
  loadSharedTenantEntry,
} from "../src/sharedDashboardEntry.ts";
test("shared Apps allow only exact deployment primary origins, using each client origin for API", () => {
  const primary =
    "https://dashboard.chaika.team, https://teamchaika-team-front-204d.twc1.net";
  assert.equal(
    dashboardHost("https://dashboard.chaika.team", primary).surface,
    "primary",
  );
  assert.equal(
    dashboardHost("https://teamchaika-team-front-204d.twc1.net", primary)
      .surface,
    "primary",
  );
  for (const host of [
    "iiko.tdpay.ru",
    "new-company.example",
    "dashboard.chaika.team.evil.example",
  ])
    assert.deepEqual(dashboardHost(`https://${host}`, primary), {
      surface: "tenant",
      apiOrigin: `https://${host}`,
    });
  assert.equal(
    dashboardHost("http://localhost:5173", primary, true).surface,
    "primary",
  );
  assert.throws(() => dashboardHost("http://localhost:5173", primary, false));
  assert.throws(() => dashboardHost("https://customer.example:8443", primary));
  for (const poisoned of [
    "https://dashboard.chaika.team/",
    "https://dashboard.chaika.team/path",
    "https://user@dashboard.chaika.team",
  ])
    assert.equal(
      dashboardHost("https://dashboard.chaika.team", poisoned).surface,
      "tenant",
    );
  assert.equal(
    validateTenantApiOrigin("https://iiko.tdpay.ru", "https://iiko.tdpay.ru"),
    "https://iiko.tdpay.ru",
  );
  for (const other of [
    "https://xx.chaika.team",
    "https://api.iiko.tdpay.ru",
    "https://iiko.tdpay.ru/",
  ])
    assert.throws(() =>
      validateTenantApiOrigin("https://iiko.tdpay.ru", other),
    );
});
test("shared tenant context failure closes entry and never falls back to primary", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 503 });
  });
  await assert.rejects(
    loadSharedTenantEntry(
      "https://iiko.tdpay.ru",
      "https://iiko.tdpay.ru",
      "/",
    ),
  );
  assert.deepEqual(
    calls.map(({ url }) => url),
    ["https://iiko.tdpay.ru/api/saas-context"],
  );
  assert.equal(calls[0].init.credentials, "omit");
});
test("explicit company API handles all auth, workspace and dashboard calls with its own CSRF", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ csrf_token: "own-token" }));
  });
  const client = createTenantApi("own", "https://iiko.tdpay.ru");
  await client.me();
  await client.login("user", "password");
  await client.password("old", "new");
  await client.workspace();
  const adapter = client.dashboardRuntime(
    () => {},
    () => {},
  );
  await adapter.request("/me");
  await adapter.renew();
  await client.logout();
  assert.ok(
    calls.every(
      ({ url, init }) =>
        url.startsWith("https://iiko.tdpay.ru/api/saas-tenant/own/") &&
        init.credentials === "include",
    ),
  );
  assert.equal(calls[1].init.headers["X-CSRF-Token"], "own-token");
  assert.ok(
    !calls.some(
      ({ url }) =>
        url.includes("xx.chaika.team") || url.includes("rc.chaika.team"),
    ),
  );
  for (const invalid of [
    "https://iiko.tdpay.ru/path",
    "http://api.iiko.tdpay.ru",
    "https://user@api.iiko.tdpay.ru",
  ])
    assert.throws(() => createTenantApi("own", invalid));
});
test("shared tenant bootstrap admits registered company sales and refuses platform context", async (t) => {
  let platform = false;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify(
          platform
            ? { surface: "platform", company: null }
            : {
                surface: "tenant",
                company: { id: "own", slug: "own", name: "My company" },
              },
        ),
      ),
  );
  assert.deepEqual(
    await loadSharedTenantEntry(
      "https://client.example",
      "https://client.example",
      "/sales",
    ),
    { surface: "tenant", slug: "own", companyName: "My company" },
  );
  await assert.rejects(
    loadSharedTenantEntry(
      "https://client.example",
      "https://client.example",
      "/tenant/other",
    ),
  );
  platform = true;
  await assert.rejects(
    loadSharedTenantEntry(
      "https://client.example",
      "https://client.example",
      "/",
    ),
  );
});

import { dashboardSectionAvailable } from "../src/dashboardRuntime.ts";
test("unavailable status never receives a tenant data link, legacy full-access remains supported", () => {
  assert.equal(
    dashboardSectionAvailable(["overview", "sales"], "status"),
    false,
  );
  assert.equal(
    dashboardSectionAvailable(["overview", "status"], "status"),
    true,
  );
  assert.equal(dashboardSectionAvailable(undefined, "status"), true);
});
test("server logout failure retains tenant CSRF for retry instead of pretending auth cleared", async (t) => {
  const calls = [];
  let fail = true;
  t.mock.method(globalThis, "fetch", async (path, init) => {
    calls.push({ path, init });
    if (path.endsWith("/logout"))
      return fail
        ? new Response(
            JSON.stringify({ detail: "Не удалось завершить сеанс" }),
            { status: 503 },
          )
        : new Response(null, { status: 204 });
    return new Response(
      JSON.stringify({ csrf_token: "tenant-retained-token" }),
    );
  });
  const client = createTenantApi("own", "https://client.example");
  await client.me();
  await assert.rejects(client.logout(), /Не удалось завершить сеанс/);
  fail = false;
  await client.logout();
  assert.deepEqual(
    calls
      .filter(({ path }) => path.endsWith("/logout"))
      .map(({ init }) => init.headers["X-CSRF-Token"]),
    ["tenant-retained-token", "tenant-retained-token"],
  );
});

test("tenant runtime serializes overview and sales while leaving session checks independent", async (t) => {
  let active = 0,
    maximum = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    calls.push(path);
    if (
      path.includes("/dashboard/overview") ||
      path.includes("/dashboard/sales/")
    ) {
      active++;
      maximum = Math.max(maximum, active);
      if (
        calls.filter((p) => p.includes("/dashboard/overview")).length === 1 &&
        path.includes("/dashboard/overview")
      )
        await gate;
      active--;
    }
    return new Response(JSON.stringify({ csrf_token: "own" }));
  });
  const client = createTenantApi("own");
  const runtime = client.dashboardRuntime(
    () => {},
    () => {},
  );
  const first = runtime.request("/overview?start=2026-09-01");
  const next = runtime.request("/sales/daily?start=2026-10-08");
  await client.me();
  assert.ok(calls.some((path) => path.endsWith("/auth/me")));
  assert.ok(!calls.some((path) => path.includes("/dashboard/sales/")));
  release();
  await Promise.all([first, next]);
  assert.equal(maximum, 1);
});
test("queued aborted report rejects promptly and skips fetch", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    calls.push(path);
    await gate;
    return new Response("{}");
  });
  const runtime = createTenantApi("own").dashboardRuntime(
    () => {},
    () => {},
  );
  const first = runtime.request("/overview");
  const controller = new AbortController();
  const queued = runtime.request("/sales/daily", { signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, { name: "AbortError" });
  release();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
});
test("failed tenant report does not poison the following queued report", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? new Response(JSON.stringify({ detail: "iiko busy" }), { status: 503 })
      : new Response("{}"),
  );
  const runtime = createTenantApi("own").dashboardRuntime(
    () => {},
    () => {},
  );
  const first = runtime.request("/overview");
  const next = runtime.request("/sales/daily");
  await assert.rejects(first, /iiko busy/);
  assert.equal((await next).status, 200);
  assert.equal(calls, 2);
});

import { canLoadRecentOverview } from "../src/dashboardRuntime.ts";
test("tenant trend waits for selected period success and never admits stale or failed data", () => {
  const selected = { start: "2026-10-08", end: "2026-10-08" };
  assert.equal(canLoadRecentOverview(true, true, null, selected), false);
  assert.equal(canLoadRecentOverview(true, true, selected, selected), false);
  assert.equal(canLoadRecentOverview(true, false, null, selected), false);
  assert.equal(
    canLoadRecentOverview(
      true,
      false,
      { start: "2026-10-07", end: "2026-10-07" },
      selected,
    ),
    false,
  );
  assert.equal(canLoadRecentOverview(true, false, selected, selected), true);
  assert.equal(canLoadRecentOverview(false, true, null, selected), true);
});

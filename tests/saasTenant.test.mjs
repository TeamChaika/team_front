import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tenantLoginPath,
  tenantSlugFromPath,
  tenantPasswordError,
} from "../src/saasAdminModel.ts";
import { createTenantApi, TenantApiError } from "../src/saasTenantApi.ts";

test("tenant entry accepts one slug only and never routes other paths", () => {
  assert.equal(tenantSlugFromPath("/tenant/company-a"), "company-a");
  assert.equal(tenantSlugFromPath("/tenant/company-a/"), "company-a");
  for (const path of [
    "/",
    "/tenant/",
    "/tenant/a/workspace",
    "/tenant/a%2Fb",
    "/tenant/../owner",
    "/tenant/A",
  ])
    assert.equal(tenantSlugFromPath(path), null);
  assert.equal(tenantLoginPath("company-a"), "/tenant/company-a");
});
test("mandatory password validation preserves password spaces and rejects mismatch", () => {
  assert.ok(tenantPasswordError("1234567", "1234567"));
  assert.ok(tenantPasswordError("password1", "password2"));
  assert.equal(
    tenantPasswordError("  exact password  ", "  exact password  "),
    null,
  );
});
test("tenant requests stay in slug scope, rotate CSRF and never exchange owner tokens", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    return new Response(
      JSON.stringify({
        csrf_token: path.endsWith("/password")
          ? "rotated-tenant-token"
          : "tenant-token",
      }),
      { status: 200 },
    );
  });
  const a = createTenantApi("company-a"),
    b = createTenantApi("company-b");
  await a.login("person@example.ru", "temporary");
  await a.password("temporary", "  own password  ");
  await a.logout();
  await b.login("other@example.ru", "other");
  assert.equal(calls[0].options.headers["X-CSRF-Token"], "");
  assert.equal(calls[1].options.headers["X-CSRF-Token"], "tenant-token");
  assert.equal(
    calls[2].options.headers["X-CSRF-Token"],
    "rotated-tenant-token",
  );
  assert.equal(calls[3].options.headers["X-CSRF-Token"], "");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    current_password: "temporary",
    new_password: "  own password  ",
  });
  assert.ok(
    calls
      .slice(0, 3)
      .every(({ path }) => path.startsWith("/api/saas-tenant/company-a/")),
  );
  assert.equal(calls[3].path, "/api/saas-tenant/company-b/auth/login");
  assert.ok(
    calls.every(({ options }) => options.credentials === "same-origin"),
  );
});
test("mandatory-change denial remains a denial without falling back to owner API", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    calls.push(path);
    return new Response(
      JSON.stringify({
        detail: { code: "password_change_required", message: "Смените пароль" },
      }),
      { status: 403 },
    );
  });
  await assert.rejects(
    createTenantApi("company-a").workspace(),
    (e) =>
      e instanceof TenantApiError &&
      e.status === 403 &&
      e.code === "password_change_required",
  );
  assert.deepEqual(calls, ["/api/saas-tenant/company-a/workspace"]);
});

test("delayed me cannot overwrite CSRF rotated by password change", async (t) => {
  let completeMe;
  const delayedMe = new Promise((resolve) => {
    completeMe = resolve;
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith("/me")) return delayedMe;
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ csrf_token: "rotated-current" }), {
      status: 200,
    });
  });
  const api = createTenantApi("company-a");
  const oldRead = api.me();
  await api.password("temporary", "new-password");
  completeMe(
    new Response(JSON.stringify({ csrf_token: "stale-old" }), { status: 200 }),
  );
  await oldRead;
  await api.logout();
  assert.equal(calls.at(-1).options.headers["X-CSRF-Token"], "rotated-current");
});

test("logout of an expired session succeeds and clears CSRF", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    calls.push({ path, options });
    return path.endsWith("/logout")
      ? new Response(JSON.stringify({ detail: "Сессия истекла" }), {
          status: 401,
        })
      : new Response(JSON.stringify({ csrf_token: "active-before-expiry" }), {
          status: 200,
        });
  });
  const api = createTenantApi("company-a");
  await api.me();
  await api.logout();
  await api.login("person@example.ru", "password");
  assert.equal(calls.at(-1).options.headers["X-CSRF-Token"], "");
});

test("production workspace uses relative same-origin API and preserves pending business modules", async (t) => {
  const payload = {
    mode: "production",
    business_modules_ready: false,
    company: {
      id: "company-a",
      name: "Company",
      slug: "company-a",
      modules: {
        analytics: true,
        documents: false,
        commercial_invoices: false,
        finance: false,
        deposits: false,
      },
    },
    admin: {
      id: "admin-a",
      username: "admin@example.ru",
      display_name: "Admin",
    },
  };
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/saas-tenant/company-a/workspace");
    assert.equal(options.credentials, "same-origin");
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  const workspace = await createTenantApi("company-a").workspace();
  assert.equal(workspace.mode, "production");
  assert.equal(workspace.business_modules_ready, false);
  assert.equal(workspace.company.modules.analytics, true);
});

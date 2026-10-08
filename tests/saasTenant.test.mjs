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

test("verified customer context opens only its own tenant and never owner panel", async () => {
  const { resolveSaasEntry } = await import("../src/saasTenantApi.ts");
  const context = {
    surface: "tenant",
    company: { id: "a", slug: "company-a", name: "Компания А" },
  };
  assert.deepEqual(resolveSaasEntry(context, "/"), {
    surface: "tenant",
    slug: "company-a",
    companyName: "Компания А",
  });
  assert.equal(
    resolveSaasEntry(context, "/tenant/company-a").surface,
    "tenant",
  );
  for (const path of [
    "/tenant/company-b",
    "/companies",
    "/saas-admin.html",
    "/tenant/",
    "/tenant/a%2Fb",
  ])
    assert.equal(resolveSaasEntry(context, path).surface, "denied");
  assert.equal(
    resolveSaasEntry({ surface: "platform", company: null }, "/").surface,
    "platform",
  );
  assert.equal(
    resolveSaasEntry(
      { surface: "platform", company: null },
      "/tenant/company-b",
    ).slug,
    "company-b",
  );
});

test("host bootstrap stays same-origin and rejects unknown or malformed context", async (t) => {
  const { loadSaasContext } = await import("../src/saasTenantApi.ts");
  let payload = {
    surface: "tenant",
    company: { id: "a", slug: "company-a", name: "Компания А" },
  };
  let status = 200;
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/saas-context");
    assert.equal(options.credentials, "same-origin");
    return new Response(JSON.stringify(payload), { status });
  });
  assert.equal((await loadSaasContext()).company.slug, "company-a");
  status = 404;
  await assert.rejects(loadSaasContext());
  status = 200;
  for (const invalid of [
    { surface: "tenant", company: null },
    { surface: "unexpected", company: null },
    { surface: "platform", company: payload.company },
    { surface: "tenant", company: { ...payload.company, slug: "a/b" } },
  ]) {
    payload = invalid;
    await assert.rejects(loadSaasContext());
  }
});

test("existing centralized account handoff never invents a temporary password", async () => {
  const { issuedAccessText } = await import("../src/saasAdminModel.ts");
  const metadata = {
    admin: { username: "person@example.ru" },
    existing_account: true,
    temporary_password: null,
  };
  const existing = issuedAccessText(
    metadata,
    "https://rc.chaika.team/tenant/a",
  );
  assert.match(existing, /person@example.ru/);
  assert.doesNotMatch(existing, /Временный пароль|null/);
  assert.match(
    issuedAccessText(
      { ...metadata, existing_account: false, temporary_password: "one-time" },
      "https://rc.chaika.team/tenant/a",
    ),
    /Временный пароль: one-time/,
  );
});

test("provision without a temporary password requires explicit existing-account success", async () => {
  const { validateIssuedAccess } = await import("../src/saasAdminModel.ts");
  assert.doesNotThrow(() =>
    validateIssuedAccess({ temporary_password: null, existing_account: true }),
  );
  assert.doesNotThrow(() =>
    validateIssuedAccess({
      temporary_password: "issued-once",
      existing_account: false,
    }),
  );
  assert.throws(
    () =>
      validateIssuedAccess({
        temporary_password: null,
        existing_account: false,
      }),
    /активации/,
  );
  assert.throws(
    () => validateIssuedAccess({ temporary_password: null }),
    /активации/,
  );
});

test("imported membership without Auth activates with provision rather than forbidden reset", async () => {
  const { adminAccessAction } = await import("../src/saasAdminModel.ts");
  const imported = {
    company_version: 4,
    exists: true,
    can_reset_password: false,
    login_path: "/tenant/ooo-chaika",
    admin: {
      id: "imported-membership",
      username: "complexitorg@gmail.com",
      display_name: "Администратор",
      must_change_password: false,
      temporary_expires_at: null,
      status: "activation_required",
    },
  };
  assert.equal(adminAccessAction(imported), "activate");
  assert.equal(
    adminAccessAction({
      ...imported,
      admin: { ...imported.admin, status: "active" },
    }),
    "none",
  );
  assert.equal(
    adminAccessAction({
      ...imported,
      can_reset_password: true,
      admin: { ...imported.admin, status: "active" },
    }),
    "reset",
  );
  assert.equal(
    adminAccessAction({ ...imported, exists: false, admin: null }),
    "create",
  );
});

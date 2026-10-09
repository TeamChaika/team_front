// Built application UI smoke. All hosts and API responses are synthetic;
// no real account, company, payment or external request is used.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const build = path.resolve(process.env.DASHBOARD_DIST || "dist");
const artifacts = path.resolve(
  process.env.BROWSER_ARTIFACTS || "/tmp/restcontrol-browser",
);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
const company = {
  id: "66666666-6666-4666-8666-666666666666",
  slug: "test-customer",
  name: "Тестовый ресторан",
};
const user = {
  id: "77777777-7777-4777-8777-777777777777",
  username: "owner@example.test",
  display_name: "Владелец сервиса",
  role: "owner",
};
const sections = [
  "overview",
  "indicators",
  "sales",
  "deposits",
  "cash-shifts",
  "invoices",
  "purchase-prices",
  "outgoing",
  "transfers",
  "writeoffs",
  "products",
  "charts",
  "balances",
  "employees",
  "events",
  "status",
  "management",
];
const unexpected = [];
const pageErrors = [];
let fullReady = true;
let available = true;
let setupAvailable = false;
let loggedIn = true;
let workingAvailable;
let contextWorkingOverride;
let canManage = true;
let actorKind = "platform_owner";
let featureReadiness;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "https://client.example.test") {
      const asset = url.pathname.startsWith("/assets/")
        ? url.pathname.slice(1)
        : "index.html";
      if (asset.includes("..")) return route.abort();
      const contentType = asset.endsWith(".js")
        ? "text/javascript"
        : asset.endsWith(".css")
          ? "text/css"
          : "text/html";
      return route.fulfill({
        body: await readFile(path.join(build, asset)),
        contentType,
      });
    }
    if (url.origin !== "https://api.client.example.test") {
      unexpected.push(request.url());
      return route.abort();
    }
    const headers = {
      "access-control-allow-origin": "https://client.example.test",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type,x-csrf-token",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    const json = (body, status = 200) =>
      route.fulfill({ status, headers, json: body });
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    switch (url.pathname) {
      case "/api/saas-context":
        return json({
          surface: "tenant",
          company,
          platform_origin: "https://platform.example.test",
          full_dashboard_ready: fullReady,
          working_dashboard_available:
            contextWorkingOverride ?? workingAvailable,
          feature_readiness: featureReadiness,
          full_dashboard_available: available,
          setup_available: setupAvailable,
        });
      case "/api/saas-tenant/test-customer/auth/me":
        return loggedIn
          ? json({
              user,
              company,
              actor: {
                kind: actorKind,
                company_id: company.id,
                auth_user_id: user.id,
              },
              must_change_password: false,
              csrf_token: "synthetic-csrf",
            })
          : json({ detail: "Войдите" }, 401);
      case "/api/saas-tenant/test-customer/workspace":
        return json({
          company: {
            ...company,
            modules: { analytics: true, documents: true, deposits: true },
          },
          admin: user,
          mode: "production",
          business_modules_ready: true,
          full_dashboard_available: available,
          full_dashboard_ready: fullReady,
          working_dashboard_available: workingAvailable,
          feature_readiness: featureReadiness,
        });
      case "/api/me":
        return json({
          user,
          departments: [],
          sales_dates: [],
          balance_dates: [],
          sections,
          can_manage: canManage,
          feature_readiness: featureReadiness,
          documents_enabled: true,
          modules: ["iiko", "deposits"],
          today: "2026-10-09",
        });
      case "/api/profile/telegram":
        return json({ available: false, linked: false });
      case "/api/management/accounts":
        return json({
          users: [],
          sections: [],
          departments: [],
          warehouses: [],
          venues: [],
        });
      case "/api/management/venues":
        return json({ venues: [], terminals: [], tenant_payments: true });
      case "/api/assistant/status":
        return json({ enabled: false, available: false });
      case "/api/auth/recovery/telegram":
        return json({
          available: true,
          url: "https://t.me/TestCompanyBot?start=recover",
        });
      default:
        unexpected.push(request.method() + " " + request.url());
        return json({ detail: "Unexpected test request" }, 500);
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("https://client.example.test/profile");
  await page.getByRole("link", { name: "Управление", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Мой профиль", exact: true })
    .waitFor();
  for (const label of [
    "Списания",
    "Остатки на складах",
    "Депозиты",
    "Технологические карты",
  ])
    assert.equal(
      await page.getByRole("link", { name: label, exact: true }).count(),
      1,
      label,
    );
  assert.match(await page.locator("body").innerText(), /Тестовый ресторан/);
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /Chaika|Чайка|chaika\.team/,
  );
  assert.equal(await page.locator('img[alt*="Chaika"]').count(), 0);
  await page.screenshot({
    path: path.join(artifacts, "tenant-desktop.png"),
    fullPage: true,
  });
  fullReady = false;
  await page.reload();
  await page.getByRole("link", { name: "Управление", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Мой профиль", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "mobile horizontal overflow",
  );
  await page.screenshot({
    path: path.join(artifacts, "tenant-mobile.png"),
    fullPage: true,
  });
  // The base runtime works while optional bot, AI and payments are unconfigured.
  workingAvailable = true;
  available = false;
  featureReadiness = Object.fromEntries(
    [
      "analytics.overview",
      "analytics.sales",
      "analytics.indicators",
      "inventory.catalog",
      "inventory.balances",
      "purchases.prices",
      "iiko.cash_shifts",
      "iiko.order_events",
      "documents.waybills",
      "documents.writeoffs",
      "commercial.incoming",
      "commercial.outgoing",
      "employees.management",
      "management.users",
      "management.settings",
      "profile.account",
      "operations.sync",
    ].map((feature) => [
      feature,
      { state: "ready", read: true, write: true, reasons: [] },
    ]),
  );
  featureReadiness["assistant.chat"] = {
    state: "blocked",
    read: false,
    write: false,
    reasons: ["ai"],
  };
  await page.goto("https://client.example.test/profile");
  await page
    .getByRole("heading", { name: "Мой профиль", exact: true })
    .waitFor();
  for (const label of ["Списания", "Управление", "Продажи"])
    assert.equal(
      await page.getByRole("link", { name: label, exact: true }).count(),
      1,
      label,
    );
  assert.equal(
    await page.getByRole("link", { name: "Депозиты", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".tenant-setup-notice").count(), 0);
  await page.screenshot({
    path: path.join(artifacts, "tenant-working-partial.png"),
    fullPage: true,
  });
  // A newer authenticated workspace upgrades a stale public setup snapshot.
  setupAvailable = true;
  contextWorkingOverride = false;
  await page.goto("https://client.example.test/management");
  await page.getByRole("tab", { name: "Заведения и терминалы" }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Списания", exact: true }).count(),
    1,
  );
  assert.equal(await page.locator(".tenant-setup-notice").count(), 0);
  contextWorkingOverride = undefined;
  canManage = false;
  featureReadiness["management.settings"] = {
    state: "not_checked",
    read: false,
    write: false,
    reasons: ["probe"],
  };
  featureReadiness["management.users"] = {
    state: "not_checked",
    read: false,
    write: false,
    reasons: ["probe"],
  };
  await page.goto("https://client.example.test/management");
  await page.getByRole("tab", { name: "Заведения и терминалы" }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Управление", exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByRole("link", { name: "Списания", exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByRole("tab", { name: "Сотрудники и доступы" }).count(),
    0,
  );
  // A ready settings feature does not grant the separate user administration feature.
  featureReadiness["management.settings"] = {
    state: "ready",
    read: true,
    write: true,
    reasons: [],
  };
  canManage = true;
  await page.reload();
  await page.getByRole("tab", { name: "Заведения и терминалы" }).waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Сотрудники и доступы" }).count(),
    0,
  );
  featureReadiness["management.settings"] = {
    state: "not_checked",
    read: false,
    write: false,
    reasons: ["probe"],
  };
  canManage = false;
  actorKind = "company_member";
  await page.goto("https://client.example.test/profile");
  await page
    .getByRole("heading", { name: "Мой профиль", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Управление", exact: true }).count(),
    0,
  );
  actorKind = "platform_owner";
  canManage = true;
  workingAvailable = false;
  featureReadiness = undefined;
  available = false;
  setupAvailable = true;
  await page.goto("https://client.example.test/");
  await page.getByRole("tab", { name: "Заведения и терминалы" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/management");
  assert.equal(
    await page.getByRole("link", { name: "Списания", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("tab", { name: "Сотрудники и доступы" }).count(),
    0,
  );
  assert.match(await page.locator("body").innerText(), /Настройка компании/);
  await page.screenshot({
    path: path.join(artifacts, "tenant-setup.png"),
    fullPage: true,
  });
  loggedIn = false;
  await page.goto("https://client.example.test/forgot-password");
  await page
    .getByRole("heading", { name: /Восстановление|Забыли|парол/ })
    .waitFor();
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /Chaika|Чайка|chaika\.team/,
  );
  await page.screenshot({
    path: path.join(artifacts, "tenant-recovery.png"),
    fullPage: true,
  });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "PASS: built tenant shell, full menu, owner identity, stale-ready history UI, working partial readiness, mobile, public recovery, no cross-host traffic",
  );
} finally {
  await browser.close();
}

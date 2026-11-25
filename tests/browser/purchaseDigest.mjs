// Exercises the built primary management screen. All requests are intercepted.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
const origin = "https://dashboard.chaika.team";
const dist = path.resolve(process.env.DASHBOARD_DIST || "dist");
const department = {
  id: "99180c83-901a-42d3-84b0-ddc63cff7ca2",
  name: "Тестовый ресторан",
  revision: 0,
  enabled: false,
  sync_enabled: true,
  chat_id: null,
  chat_title: null,
  archived: false,
  delivery: null,
};
const settings = {
  send_time: "09:00",
  timezone: "Europe/Moscow",
  bot_username: "example_bot",
  bot_configured: true,
  departments: [department],
};
let available = true;
let writes = 0;
const pageErrors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,PUT,OPTIONS",
      "access-control-allow-headers": "content-type,x-csrf-token",
    };
    if (url.origin === origin && !url.pathname.startsWith("/api/")) {
      const asset = url.pathname.startsWith("/assets/")
        ? url.pathname.slice(1)
        : "index.html";
      return route.fulfill({
        body: await readFile(path.join(dist, asset)),
        contentType: asset.endsWith(".js")
          ? "text/javascript"
          : asset.endsWith(".css")
            ? "text/css"
            : "text/html",
      });
    }
    if (![origin, "https://xx.chaika.team"].includes(url.origin))
      throw Error("Unexpected host");
    const json = (data, status = 200) =>
      route.fulfill({ json: data, status, headers });
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    switch (url.pathname) {
      case "/api/me":
        return json({
          user: { id: "owner", display_name: "Администратор", role: "owner" },
          can_manage: true,
          purchase_digest_enabled: available,
          sections: ["management"],
          departments: [],
          sales_dates: [],
          balance_dates: [],
        });
      case "/api/management/accounts":
        return json({ users: [], sections: [], departments: [], venues: [] });
      case "/api/management/venues":
        return json({ venues: [], terminals: [] });
      case "/api/management/operation-settings":
        return json({
          revision: 0,
          sync: { mode: "all", department_ids: [] },
          writeoff: { mode: "all", store_ids: [] },
          waybill: { mode: "all", store_ids: [] },
          departments: [],
          stores: [],
        });
      case "/api/assistant/status":
        return json({ enabled: false, available: false });
      case "/api/management/purchase-digest":
        assert.equal(available, true);
        return json(settings);
      case "/api/management/purchase-digest/" + department.id: {
        assert.equal(req.method(), "PUT");
        const body = req.postDataJSON();
        if (body.revision !== department.revision)
          return json({ detail: "conflict" }, 409);
        writes++;
        Object.assign(department, body, {
          revision: body.revision + 1,
          chat_title: "Канал тестового ресторана",
        });
        return json(settings);
      }
      default:
        return json({}, 404);
    }
  });
  const url = origin + "/management?tab=purchase-digest";
  await page.goto(url);
  const tab = page.getByRole("tab", { name: "Рассылка закупок" });
  await tab.waitFor();
  assert.equal(await tab.getAttribute("aria-selected"), "true");
  const edit = page.getByRole("button", {
    name: "Настроить рассылку для Тестовый ресторан",
  });
  await edit.click();
  const chat = page.getByRole("textbox", {
    name: "ID чата или ссылка на сообщение",
  });
  const enabled = page.getByLabel("Отправлять Excel в 09:00 МСК");
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  await chat.fill("https://t.me/c/1234567890123456/77");
  await enabled.check();
  await save.click();
  await page.getByText("Канал тестового ресторана", { exact: true }).waitFor();
  assert.equal(writes, 1);
  assert.equal(department.chat_id, "-1001234567890123456");
  assert.equal(department.enabled, true);
  await edit.click();
  department.revision++; // Competing administrator saved while modal was open.
  await enabled.uncheck();
  await save.click();
  await page.getByRole("button", { name: "Обновить настройки" }).click();
  await edit.click();
  await enabled.uncheck();
  await save.click();
  await page.getByText("Выключена", { exact: true }).waitFor();
  assert.equal(writes, 2);
  await page.getByRole("tab", { name: "Сотрудники и доступы" }).click();
  await page.waitForURL((u) => !u.searchParams.has("tab"));
  await tab.click();
  await page.waitForURL(url);
  await edit.waitFor();
  available = false;
  await page.reload();
  await page.getByRole("tab", { name: "Сотрудники и доступы" }).waitFor();
  assert.equal(await tab.count(), 0);
  assert.deepEqual(pageErrors, []);
  console.log(
    "PASS: primary admin tab, venue chat ID, enable/disable, revision conflicts, deep link and feature gating",
  );
} finally {
  await browser.close();
}

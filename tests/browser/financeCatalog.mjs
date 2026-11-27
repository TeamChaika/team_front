// The built application runs locally with intercepted, fictional directory data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL,
});
const origin = "https://dashboard.chaika.team";
const base = "/api/profit-loss/catalog";
const dist = path.resolve(process.env.DASHBOARD_DIST || "dist");
const venue = {
  id: "b8df592f-6837-4b7c-b681-158b02beb860",
  name: "Тестовая кухня",
};
const headers = {
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers": "content-type,x-csrf-token",
};
const errors = [];
try {
  for (const role of ["owner", "accountant", "manager"]) {
    const admin = role === "owner";
    const page = await browser.newPage({
      viewport: admin
        ? { width: 1280, height: 900 }
        : { width: 375, height: 810 },
    });
    page.setDefaultTimeout(7000);
    page.on("pageerror", (e) => errors.push(e.message));
    const requests = [];
    const catalog = {
      categories: [],
      approvers: [
        {
          id: "global",
          name: "Общий согласующий",
          available_to_all: true,
          department_ids: [],
          revision: 1,
          archived: false,
          can_edit: admin,
        },
      ],
      can_manage_global_approvers: admin,
      venues: [venue],
    };
    await page.route("**/*", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        url = u.pathname;
      assert.ok([origin, "https://xx.chaika.team"].includes(u.origin));
      if (u.origin === origin && !url.startsWith("/api/")) {
        const asset = url.startsWith("/assets/") ? url.slice(1) : "index.html";
        return route.fulfill({
          body: await readFile(path.join(dist, asset)),
          contentType: asset.endsWith(".js")
            ? "text/javascript"
            : asset.endsWith(".css")
              ? "text/css"
              : "text/html",
        });
      }
      const json = (data, status = 200) =>
        route.fulfill({ json: data, status, headers });
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      requests.push(url);
      if (url === "/api/me")
        return json({
          user: {
            id: "test",
            display_name: "Тест",
            role: admin ? "owner" : "manager",
          },
          can_manage: admin,
          profit_loss_access: role,
          sections: ["profit-loss"],
          today: "2026-11-25",
          departments: [
            {
              ...venue,
              type: "DEPARTMENT",
              present_in_latest: true,
              sync_enabled: true,
            },
          ],
          sales_dates: [],
          balance_dates: [],
        });
      if (url === base) return json(catalog);
      if (url.startsWith(base + "/")) {
        const [kind, id] = url.slice(base.length + 1).split("/");
        const rows = catalog[kind],
          key = kind === "categories" ? "code" : "id",
          body = req.postDataJSON();
        let item = rows.find((r) => r[key] === id);
        if (req.method() === "POST") {
          assert.equal(id, undefined);
          assert.equal(body.archived, undefined);
          item = {
            [key]: "new",
            archived: false,
            revision: 1,
            ...body,
            ...(kind === "approvers" ? { can_edit: true } : {}),
          };
          rows.push(item);
        } else {
          assert.equal(req.method(), "PATCH");
          if (body.revision !== item.revision)
            return json({ detail: "Запись была изменена." }, 409);
          Object.assign(item, body, { revision: item.revision + 1 });
        }
        return json(item);
      }
      if (url === "/api/management/accounts")
        return json({ users: [], departments: [], sections: [], venues: [] });
      if (url === "/api/management/venues")
        return json({ venues: [], terminals: [] });
      if (url === "/api/management/operation-settings")
        return json({
          revision: 0,
          sync: { mode: "all", department_ids: [] },
          writeoff: { mode: "all", store_ids: [] },
          waybill: { mode: "all", store_ids: [] },
          departments: [],
          stores: [],
        });
      if (url === "/api/profit-loss/expenses")
        return json({ rows: [], total: 0 });
      if (url === "/api/profit-loss/categories") return json({ rows: [] });
      if (url === "/api/documents/notifications") return json({ items: [] });
      if (url === "/api/support/context") return json({});
      return json({}, 404);
    });
    await page.goto(origin + "/management?tab=expense-catalogs");
    if (role === "manager") {
      await page.waitForURL("**/profit-loss");
      assert.equal(
        requests.some(
          (url) => url.startsWith(base) || url.startsWith("/api/management/"),
        ),
        false,
      );
      assert.equal(
        await page.getByRole("link", { name: "Управление" }).count(),
        0,
      );
      await page.close();
      continue;
    }
    await page.getByRole("heading", { name: "Справочники расходов" }).waitFor();
    if (admin)
      assert.equal(
        await page
          .getByRole("tab", { name: "Справочники расходов" })
          .getAttribute("aria-selected"),
        "true",
      );
    else
      assert.equal(
        await page.getByRole("tab", { name: "Сотрудники и доступы" }).count(),
        0,
      );
    const button = (name) => page.getByRole("button", { name, exact: true });
    const row = (name) => page.getByRole("group", { name, exact: true });
    const dialog = page.getByRole("dialog");
    await button("Добавить статью").click();
    await dialog.getByLabel("Название статьи").fill("Обслуживание");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await row("Обслуживание").getByRole("button", { name: "Изменить" }).click();
    catalog.categories[0].revision++;
    await dialog.getByLabel("Название статьи").fill("Выезд");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await dialog
      .getByRole("button", { name: "Загрузить новую версию" })
      .click();
    assert.equal(
      await dialog.getByLabel("Название статьи").inputValue(),
      "Обслуживание",
    );
    await dialog.getByLabel("Название статьи").fill("Плановый выезд");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await row("Плановый выезд")
      .getByRole("button", { name: "В архив" })
      .click();
    await row("Плановый выезд").waitFor({ state: "hidden" });
    await page.getByLabel("Показать архивные").check();
    await row("Плановый выезд")
      .getByRole("button", { name: "Вернуть из архива" })
      .click();
    await row("Плановый выезд")
      .getByRole("button", { name: "В архив" })
      .waitFor();
    await page.getByRole("tab", { name: "Согласующие", exact: true }).click();
    assert.equal(
      await row("Общий согласующий")
        .getByRole("button", { name: "Изменить" })
        .count(),
      admin ? 1 : 0,
    );
    await button("Добавить согласующего").click();
    await dialog.getByLabel("Имя согласующего").fill("Тестовый управляющий");
    if (admin) await dialog.getByLabel("Для всех заведений").check();
    else {
      assert.equal(await dialog.getByLabel("Для всех заведений").count(), 0);
      await dialog.getByRole("combobox", { name: /^Заведения/ }).click();
      await page.getByRole("option", { name: venue.name }).click();
    }
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await row("Тестовый управляющий").waitFor();
    const saved = catalog.approvers.find(
      (x) => x.name === "Тестовый управляющий",
    );
    assert.equal(saved.available_to_all, admin);
    assert.deepEqual(saved.department_ids, admin ? [] : [venue.id]);
    await row(saved.name).getByRole("button", { name: "Изменить" }).click();
    await dialog.getByLabel("Имя согласующего").fill("Новый управляющий");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await row("Новый управляющий")
      .getByRole("button", { name: "В архив" })
      .click();
    await row("Новый управляющий")
      .getByRole("button", { name: "Вернуть из архива" })
      .waitFor();
    if (!admin) {
      const width = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert.ok(
        width.content <= width.viewport,
        "Mobile catalog overflows its viewport",
      );
    }
    if (!admin)
      assert.equal(
        requests.some((url) => url.startsWith("/api/management/")),
        false,
      );
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("Expense catalogs verified for owner, accountant and manager.");
} finally {
  await browser.close();
}

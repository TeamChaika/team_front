// Exercise the production bundle using intercepted API and static assets only.
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
const dist = path.resolve(process.env.DASHBOARD_DIST || "dist");
const venue = "9f593daa-1ff4-4c93-a5ed-d45474b82376";
const expenseId = "ff536c5f-0620-4533-87f9-62c9305760ea";
const errors = [];
const unexpected = [];
const headers = {
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers": "content-type,x-csrf-token",
};
try {
  for (const role of ["manager", "accountant", "owner", null]) {
    const page = await browser.newPage({
      viewport:
        role === "manager"
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(7000);
    page.on("pageerror", (e) => errors.push(e.message));
    const writes = [];
    let reportReads = 0,
      journalReads = 0;
    let row =
      role === "accountant"
        ? {
            id: expenseId,
            department_id: venue,
            department: "Ресторан",
            author: "Другой сотрудник",
            expense_date: "2026-11-20",
            paid_date: "2026-11-21",
            category: "services",
            amount: "450.50",
            payment_method: "bank",
            revision: 2,
            comment: "",
            can_edit: true,
            cancelled: false,
          }
        : null;
    await page.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
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
      const respond = (data) => route.fulfill({ json: data, headers });
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      if (url.pathname === "/api/me")
        return respond({
          user: { id: "employee", role: "manager", display_name: "Тест" },
          profit_loss_access: role,
          sections: ["profit-loss"],
          today: "2026-11-25",
          sales_dates: [],
          balance_dates: [],
          departments: [
            {
              id: venue,
              name: "Ресторан",
              type: "DEPARTMENT",
              present_in_latest: true,
              sync_enabled: false,
            },
            {
              id: "not-a-restaurant",
              name: "База",
              type: "CENTRALSTORE",
              present_in_latest: true,
            },
            {
              id: "historic",
              name: "Закрытый",
              type: "DEPARTMENT",
              present_in_latest: false,
            },
          ],
        });
      if (url.pathname === "/api/profit-loss/report") {
        reportReads++;
        assert.deepEqual(url.searchParams.getAll("department_id"), [venue]);
        return respond({
          revenue: "1000",
          cost: "300",
          gross_profit: "700",
          expenses: "0",
          cash: "0",
          bank: "0",
          operating_profit: "700",
          by_category: [],
          complete: true,
          provisional: true,
        });
      }
      if (
        url.pathname === "/api/profit-loss/expenses" &&
        req.method() === "GET"
      ) {
        journalReads++;
        assert.deepEqual(url.searchParams.getAll("department_id"), [venue]);
        return respond({ rows: row ? [row] : [], total: row ? 1 : 0 });
      }
      if (
        url.pathname === "/api/profit-loss/expenses" &&
        req.method() === "POST"
      ) {
        const request = req.postDataJSON();
        writes.push(request);
        row = {
          ...request,
          id: expenseId,
          author: "Тест",
          department: "Ресторан",
          revision: 1,
          cancelled: false,
          can_edit: true,
        };
        if (writes.length === 1) return route.abort("connectionreset");
        return respond(row);
      }
      if (
        url.pathname === "/api/profit-loss/expenses/" + expenseId &&
        req.method() === "PATCH"
      ) {
        const request = req.postDataJSON();
        writes.push(request);
        row = { ...row, ...request, revision: 2 };
        return respond(row);
      }
      if (
        url.pathname ===
        "/api/profit-loss/expenses/" + expenseId + "/history"
      ) {
        return respond({
          rows: [
            {
              revision: 2,
              action: "update",
              actor: "Тест",
              changed_at: "2026-11-25T10:00:00+03:00",
              before: { ...row, paid_date: null },
              after: row,
            },
          ],
        });
      }
      if (
        url.pathname === "/api/profit-loss/expenses/" + expenseId + "/cancel" &&
        req.method() === "POST"
      ) {
        writes.push(req.postDataJSON());
        row = { ...row, cancelled: true, can_edit: false, revision: 3 };
        return respond(row);
      }
      if (url.pathname === "/api/support/context") return respond({});
      if (url.pathname === "/api/documents/notifications")
        return respond({ items: [] });
      unexpected.push(req.method() + " " + url.pathname);
      return route.fulfill({ status: 404, json: {}, headers });
    });
    await page.goto(origin + "/profit-loss");
    if (!role) {
      await page
        .getByText("Доступ к разделам пока не назначен.", { exact: false })
        .waitFor();
      assert.equal(journalReads, 0);
      assert.equal(reportReads, 0);
    } else {
      await page
        .getByRole("heading", {
          name: role === "manager" ? "Мои расходы" : "Журнал расходов",
        })
        .waitFor();
      if (role === "accountant")
        await page.getByText("Другой сотрудник").waitFor();
      else await page.getByText("За выбранный период расходов нет.").waitFor();
      if (role === "owner")
        await page.getByText("Операционная прибыль", { exact: true }).waitFor();
      assert.equal(reportReads > 0, role === "owner");
    }
    if (role === "manager") {
      await page.getByRole("button", { name: "Добавить расход" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Статья расхода").click();
      await page.getByRole("option", { name: "Аренда", exact: true }).click();
      await dialog.getByLabel("Сумма, ₽").fill("200,25");
      await dialog.getByLabel("Способ оплаты").click();
      await page.getByRole("option", { name: "Наличные", exact: true }).click();
      await dialog.getByRole("button", { name: "Сохранить" }).click();
      await dialog.getByRole("alert").waitFor();
      await dialog.getByRole("button", { name: "Сохранить" }).click();
      await page
        .getByRole("status")
        .filter({ hasText: "Расход сохранён." })
        .waitFor();
      assert.deepEqual(writes[0], writes[1]);
      assert.ok(writes[0].request_id);
      assert.equal(writes[1].amount, "200.25");
      assert.equal(writes[1].department_id, venue);
      await page.getByRole("button", { name: /Действия с расходом/ }).click();
      await page.getByRole("menuitem", { name: "Изменить" }).click();
      await dialog.getByLabel("Дата оплаты").fill("2026-11-24");
      await dialog.getByRole("button", { name: "Сохранить" }).click();
      await page.getByText("Оплачен · 24.11.2026").waitFor();
      assert.equal(writes[2].revision, 1);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await page.getByRole("button", { name: /Действия с расходом/ }).click();
      assert.equal(
        await page.getByRole("menuitem", { name: "Изменить" }).count(),
        0,
      );
      await page.getByRole("menuitem", { name: "История" }).click();
      await page.getByRole("heading", { name: "Расход изменён" }).waitFor();
    }
    if (role === "accountant") {
      await page.getByRole("button", { name: /Действия с расходом/ }).click();
      await page.getByRole("menuitem", { name: "Аннулировать" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Аннулировать" })
        .click();
      await page.getByText("Аннулирован", { exact: true }).waitFor();
      assert.deepEqual(writes, [{ revision: 2 }]);
      assert.equal(reportReads, 0);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "Validated P&L access for all three roles, explicit denial, mobile entry, retry, edit and history.",
  );
} finally {
  await browser.close();
}

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
const connectedVenue = "96074d28-5b9b-4b59-9da5-66984c5dd87a";
const expenseId = "ff536c5f-0620-4533-87f9-62c9305760ea";
const allocationId = "31631209-c47f-465f-94c6-1b2ce5f1b537";
const venueApprover = "14720182-747d-4f96-9b35-d222d0df639a";
const otherApprover = "f1a40a9d-fb37-4916-99a2-f4f9fff84dfd";
const sharedApprover = "ba9f627d-0020-4ad8-9abb-e9d082a50ab5";
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
    const mobile = role === "manager" || role === "accountant";
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 360, height: 740 }
        : { width: 1280, height: 900 },
      ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    page.setDefaultTimeout(7000);
    page.on("pageerror", (e) => errors.push(e.message));
    const writes = [];
    const allocationWrites = [];
    let allocationHistoryReads = 0;
    let allocation = null;
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
            ...(role === "owner" || role === "accountant"
              ? [
                  {
                    id: connectedVenue,
                    name: "Заведение с iiko",
                    type: "DEPARTMENT",
                    present_in_latest: true,
                    sync_enabled: true,
                  },
                ]
              : []),
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
      if (url.pathname === "/api/profit-loss/approvers") {
        const rows = [
          { department_id: venue, id: venueApprover, name: "Управляющий А" },
          { department_id: venue, id: sharedApprover, name: "Учредитель" },
        ];
        if (role !== "manager")
          rows.push(
            {
              department_id: connectedVenue,
              id: otherApprover,
              name: "Управляющий Б",
            },
            {
              department_id: connectedVenue,
              id: sharedApprover,
              name: "Учредитель",
            },
          );
        return respond({
          rows: rows.map((person) => ({
            ...person,
            available_to_all: person.id === sharedApprover,
          })),
        });
      }
      if (url.pathname === "/api/profit-loss/report") {
        reportReads++;
        const ids = url.searchParams.getAll("department_id");
        assert.ok(
          ids.length && ids.every((id) => [venue, connectedVenue].includes(id)),
        );
        const complete = !ids.includes(venue);
        const custom = url.searchParams.get("start") === "2026-10-15";
        return respond({
          revenue: "1000",
          cost: "300",
          gross_profit: "700",
          expenses: "0",
          cash: "0",
          bank: "0",
          operating_profit: complete ? (custom ? "650" : "700") : null,
          by_category: [],
          complete,
          provisional: true,
        });
      }
      if (
        url.pathname === "/api/profit-loss/expenses" &&
        req.method() === "GET"
      ) {
        journalReads++;
        const ids = url.searchParams.getAll("department_id");
        if (role === "owner")
          assert.ok(
            ids.length &&
              ids.every((id) => [venue, connectedVenue].includes(id)),
          );
        else
          assert.deepEqual(
            ids,
            role === "accountant" ? [venue, connectedVenue] : [venue],
          );
        return respond({ rows: row ? [row] : [], total: row ? 1 : 0 });
      }
      const allocations = "/api/profit-loss/allocations";
      if (url.pathname.startsWith(allocations)) {
        assert.ok(["owner", "accountant"].includes(role));
        if (url.pathname === allocations + "/pending") {
          assert.equal(req.method(), "GET");
          assert.ok(
            url.searchParams.has("start") && url.searchParams.has("end"),
          );
          const rows =
            allocation?.method === "pending" && !allocation.cancelled
              ? [allocation]
              : [];
          return respond({ rows, total: rows.length });
        }
        if (url.pathname === allocations + "/preview") {
          const proposal = req.postDataJSON();
          assert.ok(proposal.parts.every((part) => !("approver_id" in part)));
          assert.equal(proposal.amount, "100.01");
          assert.equal(proposal.method, "equal");
          return respond({
            method: proposal.method,
            parts: proposal.parts.map((part, index) => ({
              department_id: part.department_id,
              amount: ["50.01", "50.00"][index],
              weight: "1",
            })),
          });
        }
        if (url.pathname === allocations && req.method() === "POST") {
          const payload = req.postDataJSON();
          allocationWrites.push(payload);
          allocation = {
            ...payload,
            parts: payload.parts.map((part) => ({
              ...part,
              approver_name:
                part.approver_id === sharedApprover
                  ? "Учредитель"
                  : "Управляющий Б",
            })),
            id: allocationId,
            can_edit: true,
            cancelled: false,
            revision: 1,
          };
          return respond(allocation);
        }
        if (url.pathname === allocations + "/" + allocationId + "/history") {
          allocationHistoryReads++;
          return respond({
            rows: [
              {
                revision: 1,
                action: "create",
                actor: "Бухгалтер",
                changed_at: "2026-11-10T10:00:00+03:00",
                before: null,
                after: allocation,
              },
            ],
          });
        }
        if (url.pathname === allocations + "/" + allocationId) {
          if (req.method() === "GET") return respond(allocation);
          assert.equal(req.method(), "PATCH");
          const payload = req.postDataJSON();
          allocationWrites.push(payload);
          allocation = { ...allocation, ...payload, revision: 2 };
          return respond(allocation);
        }
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
          approver_name:
            request.approver_id === venueApprover
              ? "Управляющий А"
              : "Учредитель",
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
        row = { ...row, ...request, approver_name: "Учредитель", revision: 2 };
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
              before: {
                ...row,
                paid_date: null,
                approver_name: "Управляющий А",
              },
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
    if (role) {
      assert.equal(
        await page
          .getByRole("button", { name: "Распределить расход", exact: true })
          .count(),
        0,
      );
    }
    async function chooseVenue(editor, name) {
      await editor.getByLabel("Заведения", { exact: false }).click();
      await page.getByRole("option", { name, exact: true }).click();
      await editor.getByLabel("Заведения", { exact: false }).press("Tab");
    }
    if (role === "manager") {
      await page.getByRole("button", { name: "Добавить расход" }).click();
      const dialog = page.getByRole("dialog");
      assert.equal(
        await dialog.getByLabel("Заведение", { exact: false }).count(),
        1,
      );
      assert.equal(
        await dialog.getByLabel("Заведения", { exact: false }).count(),
        0,
      );
      assert.equal(await dialog.getByLabel("Способ распределения").count(), 0);
      await dialog.getByLabel("Статья расхода").click();
      await page.getByRole("option", { name: "Аренда", exact: true }).click();
      await dialog.getByLabel("Сумма, ₽").fill("200,25");
      const approverField = dialog.getByLabel("Кто согласовал");
      assert.equal(await approverField.inputValue(), "");
      await approverField.selectOption(venueApprover);
      const cash = dialog.getByRole("radio", { name: "Наличные", exact: true });
      const bank = dialog.getByRole("radio", {
        name: "Безналичные",
        exact: true,
      });
      assert.equal(await cash.isVisible(), true);
      assert.equal(await bank.isVisible(), true);
      assert.equal(
        await cash.evaluate((input) => input.validity.valueMissing),
        true,
      );
      await dialog.getByText("Безналичные", { exact: true }).tap();
      assert.equal(await bank.isChecked(), true);
      assert.equal(await cash.isChecked(), false);
      await cash.tap();
      assert.equal(await cash.isChecked(), true);
      assert.equal(await bank.isChecked(), false);
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
      assert.equal(writes[1].payment_method, "cash");
      assert.equal(writes[1].approver_id, venueApprover);
      await page.getByRole("cell", { name: "Управляющий А" }).waitFor();
      await page.getByRole("button", { name: /Действия с расходом/ }).click();
      await page.getByRole("menuitem", { name: "Изменить" }).click();
      await dialog.getByLabel("Сумма, ₽").tap();
      assert.equal(await cash.isChecked(), true);
      await bank.tap();
      assert.equal(await bank.isChecked(), true);
      assert.equal(await cash.isChecked(), false);
      await dialog.getByLabel("Дата оплаты").fill("2026-11-24");
      assert.equal(await approverField.inputValue(), venueApprover);
      await approverField.selectOption(sharedApprover);
      await dialog.getByRole("button", { name: "Сохранить" }).click();
      await page.getByText("Оплачен · 24.11.2026").waitFor();
      assert.equal(writes[2].revision, 1);
      assert.equal(writes[2].payment_method, "bank");
      assert.equal(writes[2].approver_id, sharedApprover);
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
      await dialog.getByText("Кто согласовал", { exact: true }).waitFor();
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
      await page.getByRole("button", { name: "Добавить расход" }).click();
      const editor = page.getByRole("dialog");
      await chooseVenue(editor, "Ресторан");
      const method = editor.getByLabel("Способ распределения");
      assert.equal(await method.count(), 0);
      await editor.getByLabel("Статья расхода").click();
      await page.getByRole("option", { name: "Аренда", exact: true }).click();
      await editor.getByLabel("Сумма, ₽").fill("100,01");
      await editor
        .getByLabel("Дата расхода", { exact: false })
        .fill("2026-11-10");
      await editor
        .getByLabel("Дата оплаты", { exact: false })
        .fill("2026-11-24");
      await editor
        .getByRole("radio", { name: "Безналичные", exact: true })
        .check();
      await editor.getByLabel("Комментарий").fill("Общая аренда за ноябрь");
      await chooseVenue(editor, "Заведение с iiko");
      assert.equal(await method.inputValue(), "equal");
      const preview = editor.getByRole("region", {
        name: "Предпросмотр распределения",
      });
      await preview.getByText(/50,01/).waitFor();
      await editor.getByLabel("Заведения", { exact: false }).press("Backspace");
      await method.waitFor({ state: "hidden" });
      assert.equal(await preview.count(), 0);
      assert.equal(await editor.getByLabel("Сумма, ₽").inputValue(), "100,01");
      await chooseVenue(editor, "Заведение с iiko");
      assert.deepEqual(await method.locator("option").allTextContents(), [
        "Поровну",
        "В процентах",
        "Произвольными суммами",
      ]);
      const deferred = editor.getByRole("checkbox", {
        name: "Распределить позже",
      });
      await deferred.check();
      const firstApprover = editor.getByLabel("Кто согласовал — Ресторан");
      const secondApprover = editor.getByLabel(
        "Кто согласовал — Заведение с iiko",
      );
      assert.equal(await firstApprover.inputValue(), "");
      assert.equal(await secondApprover.inputValue(), "");
      assert.equal(
        await firstApprover
          .locator("option", { hasText: "Управляющий Б" })
          .count(),
        0,
      );
      assert.equal(
        await secondApprover
          .locator("option", { hasText: "Управляющий А" })
          .count(),
        0,
      );
      assert.equal(
        await editor
          .getByRole("button", { name: "Сохранить", exact: true })
          .isEnabled(),
        false,
      );
      await editor
        .getByRole("button", { name: "Для всех — Учредитель" })
        .click();
      assert.equal(await firstApprover.inputValue(), sharedApprover);
      assert.equal(await secondApprover.inputValue(), sharedApprover);
      await secondApprover.selectOption(otherApprover);
      await editor
        .getByRole("button", { name: "Сохранить", exact: true })
        .click();
      const waiting = page.getByRole("region", {
        name: "Ожидают распределения",
      });
      await waiting
        .getByRole("button", { name: "Открыть распределение" })
        .click();
      assert.equal(allocationWrites.length, 1);
      assert.equal(allocationWrites[0].method, "pending");
      assert.deepEqual(
        allocationWrites[0].parts.map((p) => p.approver_id),
        [sharedApprover, otherApprover],
      );
      assert.equal(allocationWrites[0].amount, "100.01");
      assert.equal(allocationWrites[0].category, "rent");
      assert.equal(allocationWrites[0].payment_method, "bank");
      assert.equal(allocationWrites[0].expense_date, "2026-11-10");
      assert.equal(allocationWrites[0].paid_date, "2026-11-24");
      assert.equal(allocationWrites[0].comment, "Общая аренда за ноябрь");
      assert.ok(allocationWrites[0].request_id);
      assert.equal(
        writes.length,
        1,
        "shared creation should not write a direct expense",
      );
      assert.equal(allocationHistoryReads, 0);
      await editor.getByText("История", { exact: true }).click();
      await editor.getByRole("heading", { name: "Счёт создан" }).waitFor();
      await editor
        .locator(".pl-allocation-history")
        .getByText("Кто согласовал · Управляющий Б")
        .waitFor();
      assert.equal(allocationHistoryReads, 1);
      assert.deepEqual(
        allocationWrites[0].parts.map((part) => part.department_id).sort(),
        [venue, connectedVenue].sort(),
      );
      assert.equal(await deferred.isChecked(), true);
      assert.equal(await firstApprover.inputValue(), sharedApprover);
      assert.equal(await secondApprover.inputValue(), otherApprover);
      await deferred.uncheck();
      await method.selectOption("equal");
      const save = editor.getByRole("button", { name: /Сохранить/ });
      const calculate = editor.getByRole("button", { name: "Рассчитать доли" });
      if (await calculate.isVisible()) await calculate.click();
      await preview.waitFor();
      await save.click();
      await editor.waitFor({ state: "hidden" });
      assert.equal(allocationWrites.length, 2);
      assert.equal(allocationWrites[1].revision, 1);
      assert.equal(allocationWrites[1].expense_date, "2026-11-10");
      assert.equal(allocationWrites[1].paid_date, "2026-11-24");
      assert.deepEqual(
        allocationWrites[1].parts.map((part) => part.amount).sort(),
        ["50.00", "50.01"],
      );
      await waiting.getByText("Нет отложенных расходов за период.").waitFor();
      await page.getByRole("button", { name: "Добавить расход" }).click();
      await chooseVenue(editor, "Ресторан");
      await editor.getByLabel("Статья расхода").click();
      await page.getByRole("option", { name: "Аренда", exact: true }).click();
      await editor.getByLabel("Сумма, ₽").fill("250");
      await editor.getByLabel("Кто согласовал").selectOption(venueApprover);
      await editor
        .getByRole("radio", { name: "Наличные", exact: true })
        .check();
      await editor
        .getByRole("button", { name: "Сохранить", exact: true })
        .click();
      await editor.waitFor({ state: "hidden" });
      assert.equal(writes.length, 2);
      assert.equal(writes[1].department_id, venue);
      assert.equal(writes[1].amount, "250.00");
      assert.equal(
        allocationWrites.length,
        2,
        "one venue uses the direct journal",
      );
      assert.equal(reportReads, 0);
    }
    if (role === "owner") {
      const summary = page.getByRole("region", {
        name: "Финансовый результат",
      });
      const journal = page.getByRole("heading", { name: "Журнал расходов" });
      const picker = page.getByRole("button", { name: /Выбор ресторанов/ });
      async function changeFilter(action, ids, start, end) {
        await Promise.all([
          ...["report", "expenses"].map((endpoint) =>
            page.waitForResponse((res) => {
              const u = new URL(res.url());
              return (
                u.pathname === "/api/profit-loss/" + endpoint &&
                u.searchParams.getAll("department_id").join() === ids.join() &&
                u.searchParams.get("start") === start &&
                u.searchParams.get("end") === end
              );
            }),
          ),
          action(),
        ]);
        await page
          .getByText("Операционная прибыль", { exact: true })
          .first()
          .waitFor();
        await page
          .getByText("За выбранный период расходов нет.")
          .first()
          .waitFor();
        assert.equal(
          await summary.count(),
          1,
          "single summary after filter change",
        );
        assert.equal(
          await journal.count(),
          1,
          "single journal after filter change",
        );
      }
      await picker.click();
      await page
        .getByRole("checkbox", { name: "Заведение с iiko", exact: true })
        .check();
      await changeFilter(
        () => page.getByRole("button", { name: "Применить" }).click(),
        [connectedVenue],
        "2026-11-01",
        "2026-11-25",
      );
      await picker.click();
      await page
        .getByRole("checkbox", { name: "Все рестораны (2)", exact: true })
        .check();
      await changeFilter(
        () => page.getByRole("button", { name: "Применить" }).click(),
        [venue, connectedVenue],
        "2026-11-01",
        "2026-11-25",
      );
      const syncedButton = page.getByRole("button", {
        name: "Выбрать заведения с синхронизацией iiko (1)",
      });
      await changeFilter(
        () => syncedButton.click(),
        [connectedVenue],
        "2026-11-01",
        "2026-11-25",
      );
      assert.match(await picker.innerText(), /Заведение с iiko/);
      assert.equal(await syncedButton.count(), 0);
      await changeFilter(
        () => page.getByLabel("Месяц", { exact: true }).fill("2026-10"),
        [connectedVenue],
        "2026-10-01",
        "2026-10-31",
      );
      assert.equal(
        await page.getByLabel("По", { exact: true }).inputValue(),
        "2026-10-31",
      );
      await changeFilter(
        () => page.getByLabel("С", { exact: true }).fill("2026-10-15"),
        [connectedVenue],
        "2026-10-15",
        "2026-10-31",
      );
      assert.equal(
        await page.getByLabel("Месяц", { exact: true }).inputValue(),
        "",
      );
      await summary.getByText(/650,00/).waitFor();
      await changeFilter(
        () => page.getByLabel("По", { exact: true }).fill("2026-10-20"),
        [connectedVenue],
        "2026-10-15",
        "2026-10-20",
      );
      assert.equal(
        await page.getByLabel("С", { exact: true }).inputValue(),
        "2026-10-15",
      );
      assert.equal(
        await page.getByLabel("По", { exact: true }).inputValue(),
        "2026-10-20",
      );
      await page.getByRole("button", { name: "Добавить расход" }).click();
      const editor = page.getByRole("dialog");
      assert.equal(await editor.getByLabel("Способ распределения").count(), 0);
      await chooseVenue(editor, "Ресторан");
      assert.equal(
        await editor.getByLabel("Способ распределения").inputValue(),
        "equal",
      );
      await editor.getByLabel("Статья расхода").click();
      await page.getByRole("option", { name: "Аренда", exact: true }).click();
      await editor.getByLabel("Сумма, ₽").fill("100,01");
      await editor
        .getByRole("radio", { name: "Наличные", exact: true })
        .check();
      await editor
        .getByRole("region", { name: "Предпросмотр распределения" })
        .getByText(/50,01/)
        .waitFor();
      await editor
        .getByRole("button", { name: "Для всех — Учредитель" })
        .click();
      await editor
        .getByRole("button", { name: "Сохранить", exact: true })
        .click();
      await editor.waitFor({ state: "hidden" });
      assert.equal(allocationWrites.length, 1);
      assert.equal(writes.length, 0);
      assert.equal(allocationWrites[0].method, "equal");
      assert.deepEqual(
        allocationWrites[0].parts.map((part) => part.department_id).sort(),
        [venue, connectedVenue].sort(),
      );
      assert.deepEqual(
        allocationWrites[0].parts.map((part) => part.amount).sort(),
        ["50.00", "50.01"],
      );
    }
    await page.close();
  }
  // A paid manager entry can become a shared expense without losing its source data.
  for (const role of ["manager", "accountant", "owner"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(7000);
    page.on("pageerror", (e) => errors.push(e.message));
    const source = {
      id: expenseId,
      department_id: venue,
      department: "Ресторан",
      author: "Менеджер",
      approver_id: sharedApprover,
      approver_name: "Учредитель при создании",
      expense_date: "2026-11-20",
      paid_date: "2026-11-21",
      category: "services",
      amount: "450.50",
      payment_method: "bank",
      revision: 7,
      comment: "Оплачено менеджером",
      can_edit: role !== "manager",
      can_allocate: role !== "manager",
      cancelled: false,
    };
    const conversionWrites = [];
    const directWrites = [];
    const byPercent = role === "accountant";
    const splitMethod = byPercent ? "percent" : "amount";
    const expectedAmounts = byPercent
      ? ["182.45", "268.05"]
      : ["349.99", "100.51"];
    const shares = byPercent ? ["40.5", "59.5"] : expectedAmounts;
    let historicalMethod;
    function storedGroup() {
      const payload = conversionWrites.at(-1);
      return {
        id: allocationId,
        ...payload,
        method: historicalMethod ?? payload.method,
        revision: 1,
        can_edit: true,
        cancelled: false,
        parts: payload.parts.map((part) => ({
          ...part,
          ...(historicalMethod
            ? {
                amount: "225.25",
                weight: historicalMethod === "weights" ? "1" : "0.5",
              }
            : { weight: byPercent ? part.weight : part.amount }),
        })),
      };
    }
    let converted = false;
    await page.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
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
          user: {
            id: role,
            role: role === "owner" ? "owner" : "manager",
            display_name: role,
          },
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
            },
            {
              id: connectedVenue,
              name: "Заведение с iiko",
              type: "DEPARTMENT",
              present_in_latest: true,
            },
          ],
        });
      if (url.pathname === "/api/profit-loss/approvers")
        return respond({
          rows: [venue, connectedVenue].map((department_id) => ({
            department_id,
            id: sharedApprover,
            name: "Учредитель",
            available_to_all: true,
          })),
        });
      if (url.pathname === "/api/profit-loss/report")
        return respond({
          revenue: "1000",
          cost: "300",
          gross_profit: "700",
          expenses: "450.50",
          cash: "0",
          bank: "450.50",
          operating_profit: "249.50",
          by_category: [],
          complete: true,
          provisional: false,
        });
      if (
        url.pathname === "/api/profit-loss/expenses" &&
        req.method() === "GET"
      )
        return respond({
          rows: [
            {
              ...source,
              ...(converted
                ? {
                    status: "converted",
                    cancelled: true,
                    can_edit: false,
                    converted_allocation_id: allocationId,
                    can_allocate: false,
                    can_view_allocation: true,
                  }
                : {}),
            },
          ],
          total: 1,
        });
      if (url.pathname === "/api/profit-loss/allocations/pending")
        return respond({ rows: [], total: 0 });
      if (
        url.pathname === "/api/profit-loss/allocations/" + allocationId &&
        req.method() === "GET"
      )
        return respond(storedGroup());
      if (url.pathname === "/api/profit-loss/allocations/preview") {
        const proposal = req.postDataJSON();
        assert.equal(proposal.amount, source.amount);
        if (
          historicalMethod === "revenue" &&
          proposal.method === historicalMethod
        )
          return route.fulfill({
            status: 422,
            json: { detail: "Выручка за месяц загружена не полностью." },
            headers,
          });
        assert.ok(["equal", splitMethod].includes(proposal.method));
        assert.deepEqual(
          proposal.parts.map((part) => part.department_id).sort(),
          [venue, connectedVenue].sort(),
        );
        return respond({
          method: proposal.method,
          parts: proposal.parts.map((part) => {
            const index = part.department_id === venue ? 0 : 1;
            if (proposal.method === "equal")
              return { ...part, amount: "225.25", weight: "1" };
            const share = byPercent ? part.weight : part.amount;
            assert.equal(Number(share), Number(shares[index]));
            return { ...part, amount: expectedAmounts[index], weight: share };
          }),
        });
      }
      if (
        url.pathname ===
          "/api/profit-loss/expenses/" + expenseId + "/allocate" &&
        req.method() === "POST"
      ) {
        const payload = req.postDataJSON();
        conversionWrites.push(payload);
        if (conversionWrites.length === 1)
          return route.abort("connectionreset");
        converted = true;
        return respond(storedGroup());
      }
      if (
        url.pathname === "/api/profit-loss/expenses/" + expenseId &&
        req.method() === "PATCH"
      ) {
        directWrites.push(req.postDataJSON());
        return respond(source);
      }
      if (url.pathname === "/api/support/context") return respond({});
      if (url.pathname === "/api/documents/notifications")
        return respond({ items: [] });
      unexpected.push(req.method() + " " + url.pathname);
      return route.fulfill({ status: 404, json: {}, headers });
    });
    await page.goto(origin + "/profit-loss");
    await page.getByText("Оплачено менеджером", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Действия с расходом/ }).click();
    const convert = page.getByRole("menuitem", {
      name: "Распределить по заведениям",
    });
    if (role === "manager") {
      assert.equal(await convert.count(), 0);
    } else {
      await convert.click();
      const editor = page.getByRole("dialog");
      await editor
        .getByRole("heading", { name: "Распределить расход" })
        .waitFor();
      assert.equal(await editor.getByLabel("Сумма, ₽").inputValue(), "450,50");
      assert.equal(
        await editor.getByLabel("Дата расхода").inputValue(),
        source.expense_date,
      );
      assert.equal(
        await editor.getByLabel("Дата оплаты").inputValue(),
        source.paid_date,
      );
      assert.equal(
        await editor.getByLabel("Комментарий").inputValue(),
        source.comment,
      );
      assert.equal(
        await editor
          .getByRole("radio", { name: "Безналичные", exact: true })
          .isChecked(),
        true,
      );
      assert.equal(
        await editor
          .getByRole("button", { name: "Распределить расход", exact: true })
          .isDisabled(),
        true,
        "conversion requires another venue and must not fall through to direct PATCH",
      );
      assert.deepEqual(directWrites, []);
      await editor.getByLabel("Заведения", { exact: false }).click();
      await page
        .getByRole("option", { name: "Заведение с iiko", exact: true })
        .click();
      await editor.getByLabel("Заведения", { exact: false }).press("Tab");
      const sourceApprover = editor.getByLabel("Кто согласовал — Ресторан");
      const addedApprover = editor.getByLabel(
        "Кто согласовал — Заведение с iiko",
      );
      assert.equal(
        await sourceApprover.locator("option:checked").innerText(),
        source.approver_name,
      );
      assert.equal(
        await addedApprover.inputValue(),
        "",
        "one available option still requires a choice",
      );
      await editor
        .getByRole("button", { name: "Для всех — Учредитель" })
        .click();
      assert.equal(await addedApprover.inputValue(), sharedApprover);
      const preview = editor.getByRole("region", {
        name: "Предпросмотр распределения",
      });
      await preview
        .getByText(/225,25/)
        .first()
        .waitFor();
      const method = editor.getByLabel("Способ распределения");
      await method.selectOption(splitMethod);
      const label = byPercent ? "Доля, %" : "Сумма, ₽";
      const first = editor.getByLabel(label + " — Ресторан", { exact: true });
      const second = editor.getByLabel(label + " — Заведение с iiko", {
        exact: true,
      });
      const confirm = editor.getByRole("button", {
        name: "Распределить расход",
        exact: true,
      });
      await first.fill(shares[0].replace(".", ","));
      for (const invalid of byPercent
        ? ["59,49", "59,51"]
        : ["100,50", "100,52"]) {
        await second.fill(invalid);
        assert.equal(
          await confirm.isDisabled(),
          true,
          "reject totals above and below the expense",
        );
        assert.equal(
          await preview.count(),
          0,
          "old preview must not survive invalid input",
        );
      }
      await second.fill(shares[1].replace(".", ","));
      for (const amount of expectedAmounts)
        await preview
          .getByText(amount.replace(".", ","), { exact: false })
          .waitFor();
      await confirm.click();
      await editor.getByRole("alert").waitFor();
      await confirm.click();
      await editor.waitFor({ state: "hidden" });
      assert.deepEqual(conversionWrites[0], conversionWrites[1]);
      assert.equal(conversionWrites[0].revision, source.revision);
      assert.ok(conversionWrites[0].request_id);
      for (const key of [
        "expense_date",
        "paid_date",
        "category",
        "amount",
        "payment_method",
        "comment",
      ])
        assert.equal(conversionWrites[0][key], source[key], key);
      assert.equal(conversionWrites[0].method, splitMethod);
      assert.deepEqual(
        conversionWrites[0].parts
          .map((part) => [part.department_id, part.amount])
          .sort(),
        [
          [venue, expectedAmounts[0]],
          [connectedVenue, expectedAmounts[1]],
        ].sort(),
      );
      assert.deepEqual(
        directWrites,
        [],
        "conversion must not PATCH the direct expense",
      );
      await page.getByText("Оплачено менеджером", { exact: true }).waitFor();
      await page
        .getByText("Передан в распределение", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: /Действия с расходом/ }).click();
      assert.equal(
        await convert.count(),
        0,
        "converted source cannot convert again",
      );
      await page
        .getByRole("menuitem", { name: "Открыть распределение" })
        .click();
      await first.waitFor();
      assert.equal(await method.inputValue(), splitMethod);
      assert.equal(
        Number((await first.inputValue()).replace(",", ".")),
        Number(shares[0]),
      );
      assert.equal(
        Number((await second.inputValue()).replace(",", ".")),
        Number(shares[1]),
      );
      await editor
        .getByRole("button", { name: "Закрыть", exact: true })
        .click();
      historicalMethod = byPercent ? "weights" : "revenue";
      await page.getByRole("button", { name: /Действия с расходом/ }).click();
      await page
        .getByRole("menuitem", { name: "Открыть распределение" })
        .click();
      await method.waitFor();
      assert.equal(await method.inputValue(), historicalMethod);
      if (historicalMethod === "weights") {
        assert.equal(
          await editor.getByLabel("Вес: Ресторан").inputValue(),
          "1",
        );
      } else {
        await editor.getByRole("button", { name: "Рассчитать доли" }).click();
        await editor
          .getByRole("alert")
          .filter({ hasText: "Выручка за месяц загружена не полностью" })
          .waitFor();
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "Validated P&L roles, mobile entry, equal, percentage and exact amount splits, deferral, paid expense conversion, retry, editing, legacy methods and history.",
  );
} finally {
  await browser.close();
}

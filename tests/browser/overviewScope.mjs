import assert from "node:assert/strict";
import { salesDepartments } from "./salesScope.mjs";

const today = "2026-10-09";
const yesterday = "2026-10-08";
const shifted = (date, days) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);

function period(start, end, count, revenuePerVenue, missingDates = []) {
  const days = 1 + (Date.parse(end) - Date.parse(start)) / 86400000;
  const totals = {
    revenue: count * revenuePerVenue,
    cost: count * 40,
    gross_profit: count * (revenuePerVenue - 40),
    average_check: revenuePerVenue / 2,
    checks: count * 2,
    guests: count * 3,
    guests_per_day: (count * 3) / days,
    cost_share: 4000 / revenuePerVenue,
    margin: 100 - 4000 / revenuePerVenue,
    markup: (100 * (revenuePerVenue - 40)) / 40,
  };
  return {
    start,
    end,
    days,
    complete: missingDates.length === 0,
    reviewed: true,
    missing_dates: missingDates,
    partial_days: [],
    reconciliation_issues: [],
    loaded_dates: Array.from({ length: days }, (_, i) =>
      shifted(start, i),
    ).filter((d) => !missingDates.includes(d)),
    totals: Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [
        k,
        missingDates.length ? null : String(v),
      ]),
    ),
  };
}

function overviewResponse(params, available, gap) {
  const start = params.get("start"),
    end = params.get("end");
  const ids = params.getAll("department_id");
  const venues = available.filter(
    (v) =>
      (!ids.length || ids.includes(v.id)) &&
      (!v.archived || params.get("include_archived") === "true"),
  );
  const paused =
    start <= today && today <= end && venues.some((v) => !v.sync_enabled);
  const missing = [
    paused && today,
    gap && start <= gap && gap <= end && gap,
  ].filter(Boolean);
  const current = period(start, end, venues.length, 150, missing);
  const previous = period(
    shifted(start, -current.days),
    shifted(start, -1),
    venues.length,
    100,
  );
  const changes = Object.fromEntries(
    Object.keys(current.totals).map((key) => {
      const value = current.totals[key],
        before = Number(previous.totals[key]);
      return [
        key,
        value === null
          ? { absolute: null, percent: null }
          : {
              absolute: String(Number(value) - before),
              percent: String((100 * (Number(value) - before)) / before),
            },
      ];
    }),
  );
  const trend = Array.from({ length: current.days }, (_, i) => {
    const day = shifted(start, i),
      prior = shifted(previous.start, i);
    return {
      current: period(
        day,
        day,
        venues.length,
        150,
        missing.filter((d) => d === day),
      ),
      previous: period(prior, prior, venues.length, 100),
    };
  });
  return {
    current,
    previous,
    trend,
    trends: { day: trend },
    changes,
    restaurants: venues.map((v) => ({
      department: v.name,
      department_id: v.id,
      changes,
      totals: period(start, end, 1, 150, missing).totals,
      previous_totals: period(previous.start, previous.end, 1, 100).totals,
    })),
    dish_current: current,
    dish_previous: previous,
    top_dishes: [],
    live:
      start <= today && today <= end
        ? paused
          ? { source: "stored", status: "sync_paused", stale: true }
          : { source: "iiko_api", stale: false }
        : undefined,
  };
}

export async function verifyOverviewScope(context) {
  const page = await context.newPage();
  try {
    await page.clock.setFixedTime(new Date(today + "T12:00:00Z"));
    let venues = salesDepartments,
      historyGap;
    const requests = [];
    await page.route("**/api/overview?*", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      requests.push(params);
      await route.fulfill({
        json: overviewResponse(params, venues, historyGap),
      });
    });
    const gotMeta = page.waitForResponse(
      (res) => new URL(res.url()).pathname === "/api/me",
    );
    await page.goto("https://client.example.test/");
    const meta = await (await gotMeta).json();
    const picker = page.getByRole("button", { name: /Выбор ресторанов/ });
    const cards = page.locator(".overview-kpis .kpi-card strong");
    async function selectYesterday() {
      await page.getByLabel("Начало периода").fill(yesterday);
      await page.getByLabel("Конец периода").fill(yesterday);
    }
    const chartPoints = page.locator(".overview-chart").getByRole("link");
    const unavailable = page.getByText("Синхронизация с iiko приостановлена.", {
      exact: false,
    });
    await cards.first().waitFor();
    assert.deepEqual(await cards.allInnerTexts(), [
      "300 ₽",
      "80 ₽",
      "220 ₽",
      "75 ₽",
    ]);
    assert.match(await picker.innerText(), /2 из 3/);
    assert.match(
      await page
        .locator(".overview-kpis .overview-delta")
        .first()
        .getAttribute("title"),
      /Предыдущий период: 200 ₽/,
    );
    await chartPoints.first().waitFor();
    const active = salesDepartments
      .filter((v) => v.sync_enabled)
      .map((v) => v.id)
      .sort();
    for (const [start, end] of [
      [today, today],
      [shifted(today, -30), yesterday],
    ]) {
      assert.ok(
        requests.some((p) => p.get("start") === start && p.get("end") === end),
      );
      for (const p of requests.filter(
        (p) => p.get("start") === start && p.get("end") === end,
      )) {
        assert.deepEqual(p.getAll("department_id").sort(), active);
      }
    }
    assert.equal(await page.locator(".overview-quality").count(), 0);
    assert.equal(await unavailable.count(), 0);
    assert.equal(await chartPoints.count(), 30);
    assert.match(
      await chartPoints.first().getAttribute("aria-label"),
      /300 ₽.*Сравнение.*200 ₽/,
    );
    assert.equal(
      await page.locator(".overview-restaurants tbody tr").count(),
      2,
    );

    await chartPoints.first().press("Enter");
    const salesRevenue = page
      .getByRole("link", { name: "Выручка — открыть расшифровку" })
      .locator("strong");
    await page.getByRole("heading", { name: "Продажи", exact: true }).waitFor();
    await salesRevenue.waitFor();
    assert.equal(await salesRevenue.innerText(), "300,00 ₽");
    assert.equal(
      await page.getByLabel("Начало периода").inputValue(),
      shifted(today, -30),
    );

    await page.goto("https://client.example.test/");
    await cards.first().waitFor();
    await picker.click();
    await page
      .getByRole("checkbox", { name: "Все рестораны (3)", exact: true })
      .check();
    await page.getByRole("button", { name: "Применить" }).click();
    await cards.first().getByText("—", { exact: true }).waitFor();
    assert.equal(await page.locator(".overview-quality").count(), 0);
    assert.equal(await unavailable.count(), 0);
    assert.equal(
      await page
        .getByText(
          /Продажи загружены не полностью|Рейтинг блюд ожидает загрузки|Отклонений в загруженных продажах и/,
        )
        .count(),
      0,
    );
    // A real missing historical day still needs to explain an unavailable total.
    historyGap = yesterday;
    await selectYesterday();
    await page
      .locator(".overview-quality summary")
      .filter({ hasText: /0 из 1/ })
      .first()
      .waitFor();
    historyGap = undefined;
    await page.goto("https://client.example.test/");
    await cards.first().waitFor();
    await selectYesterday();
    await cards.first().getByText("450 ₽", { exact: true }).waitFor();
    assert.match(await picker.innerText(), /Все рестораны \(3\)/);

    await page.route("**/api/me", (route) =>
      route.fulfill({ json: { ...meta, departments: venues } }),
    );
    venues = salesDepartments.map((v) => ({ ...v, archived: v.name === "Юг" }));
    await page.reload();
    await cards.first().getByText("150 ₽", { exact: true }).waitFor();
    assert.match(await picker.innerText(), /1 из 2/);
    await page.getByRole("checkbox", { name: "Показать архивные" }).check();
    await cards.first().getByText("300 ₽", { exact: true }).waitFor();
    assert.match(await picker.innerText(), /2 из 3/);

    venues = salesDepartments.map((v) => ({ ...v, sync_enabled: false }));
    requests.length = 0;
    await page.reload();
    await picker.getByText(/0 из 3/).waitFor();
    assert.equal(requests.filter((p) => p.get("end") === today).length, 0);
    assert.equal(await page.locator(".overview-quality").count(), 0);
    await selectYesterday();
    await cards.first().getByText("450 ₽", { exact: true }).waitFor();
  } finally {
    await page.close();
  }
}

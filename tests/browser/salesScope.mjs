import assert from "node:assert/strict";

export const salesDepartments = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Север",
    sync_enabled: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Юг",
    sync_enabled: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Запад",
    sync_enabled: false,
  },
];

export function salesResponse(params) {
  const start = params.get("start");
  const end = params.get("end");
  const ids = params.getAll("department_id");
  const venues = salesDepartments.filter(
    (v) => !ids.length || ids.includes(v.id),
  );
  const paused = end === "2026-10-09" && venues.some((v) => !v.sync_enabled);
  const rows = paused
    ? []
    : venues.map(({ id, name }, ordinal) => ({
        business_date: start,
        department_id: id,
        department: name,
        report_id: "20000000-0000-4000-8000-000000000001",
        ordinal,
        dimensions: {},
        revenue: 150,
        cost: 40,
        checks: 2,
        guests: 3,
        reviewed: true,
      }));
  return {
    start,
    end,
    rows,
    complete: !paused,
    loaded_dates: paused ? [] : [start],
    missing_dates: paused ? [start] : [],
    totals: {
      revenue: paused ? null : 150 * rows.length,
      cost: paused ? null : 40 * rows.length,
      gross_profit: paused ? null : 110 * rows.length,
      average_check: paused ? null : 75,
      checks: paused ? null : 2 * rows.length,
      guests: paused ? null : 3 * rows.length,
    },
    live:
      end === "2026-10-09"
        ? paused
          ? { source: "stored", status: "sync_paused", stale: true }
          : { source: "iiko_api", stale: false }
        : undefined,
  };
}

export async function verifySalesScopes(page) {
  const picker = page.getByRole("button", { name: /Выбор ресторанов/ });
  const cards = [
    "Выручка",
    "Себестоимость продаж",
    "Валовая прибыль",
    "Средний чек",
  ].map((name) =>
    page
      .getByRole("link", { name: `${name} — открыть расшифровку` })
      .locator("strong"),
  );
  await page.getByRole("link", { name: "Продажи", exact: true }).click();
  await cards[0].waitFor();
  assert.deepEqual(await Promise.all(cards.map((c) => c.innerText())), [
    "300,00 ₽",
    "80,00 ₽",
    "220,00 ₽",
    "75,00 ₽",
  ]);
  assert.match(await picker.innerText(), /2 из 3/);
  const rows = page.locator("section.panel").getByRole("row");
  assert.deepEqual(await rows.getByRole("link").allTextContents(), [
    "Север",
    "Юг",
  ]);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV" }).click(),
  ]);
  const stream = await dl.createReadStream();
  let csv = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) csv += chunk;
  assert.match(csv, /Север/);
  assert.match(csv, /Юг/);
  assert.doesNotMatch(csv, /Запад/);

  await rows.getByRole("link", { name: "Север" }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("cell", { name: "Север" }).waitFor();
  assert.equal(await detail.getByRole("cell", { name: "Запад" }).count(), 0);
  await detail.getByRole("button", { name: "Закрыть строку отчёта" }).click();

  // Explicitly requesting all venues must not silently continue showing two.
  await picker.click();
  await page.getByRole("checkbox", { name: "Все рестораны (3)" }).check();
  await page.getByRole("button", { name: "Применить" }).click();
  await page.getByRole("heading", { name: "Ничего не найдено" }).waitFor();
  assert.equal(await cards[0].innerText(), "—");
  await picker.click();
  await page.getByRole("checkbox", { name: /С синхронизацией/ }).check();
  await page.getByRole("button", { name: "Применить" }).click();
  await rows.getByRole("link", { name: "Север" }).waitFor();

  await page.getByRole("button", { name: "Последний день OLAP" }).click();
  await rows.getByRole("link", { name: "Запад" }).waitFor();
  assert.match(await picker.innerText(), /Все рестораны \(3\)/);
  assert.equal(await cards[0].innerText(), "450,00 ₽");

  // An explicit venue stays selected across period changes, including a paused venue.
  await picker.click();
  await page.getByLabel("Запад", { exact: true }).check();
  await page.getByRole("button", { name: "Применить" }).click();
  await page.getByText("150,00 ₽", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Сегодня · iiko" }).click();
  await page.getByRole("heading", { name: "Ничего не найдено" }).waitFor();
  assert.match(await picker.innerText(), /Запад/);
  assert.equal(await cards[0].innerText(), "—");
  assert.doesNotMatch(
    await page.locator("main").innerText(),
    /Недостаточно данных за выбранный период|Сохранённые строки доступны|Сегодня · сохранённые данные|Синхронизация с iiko приостановлена/,
  );

  // Each complete-report KPI can have an independent zero or missing value.
  const cases = [
    {
      totals: { revenue: null, cost: 12, gross_profit: null, average_check: 0 },
      expected: ["—", "12,00 ₽", "—", "0,00 ₽"],
    },
    {
      totals: { revenue: 0, cost: null, gross_profit: 0, average_check: null },
      expected: ["0,00 ₽", "—", "0,00 ₽", "—"],
    },
  ];
  const reportUrl = "**/api/sales/daily?*";
  for (const { totals, expected } of cases) {
    const handler = (route) => {
      const report = salesResponse(new URL(route.request().url()).searchParams);
      return route.fulfill({
        json: { ...report, totals: { ...report.totals, ...totals } },
      });
    };
    await page.route(reportUrl, handler);
    await page.reload();
    await cards[0].waitFor();
    assert.deepEqual(
      await Promise.all(cards.map((c) => c.innerText())),
      expected,
    );
    await page.unroute(reportUrl, handler);
  }
}

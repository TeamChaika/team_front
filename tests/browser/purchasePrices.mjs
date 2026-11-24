import assert from "node:assert/strict";

const cutoff = "2026-09-09";
const reportUrl = "https://client.example.test/purchase-prices";
const receipt = (date, price) => ({
  date, price, amount: "1", sum: price,
  lines: [{
    document_id: "invoice-" + date, document_number: date, num: 1, num_occurrence: 1,
    supplier: "Тестовый поставщик", store: "Тестовый склад", department: null,
    amount: "1", sum: price, price, last_seen_at: date,
  }],
});
const earlier = receipt("2026-07-15", "100");
const rows = Array.from({ length: 54 }, (_, i) => {
  const date = ["2026-09-08", cutoff][i] ?? (i === 53 ? "2026-10-09" : "2026-10-08");
  return {
    product_id: `90000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    product: "Ингредиент " + i,
    unit_id: "91000000-0000-4000-8000-000000000001",
    unit: "кг",
    scope_label: "Вся сеть",
    linked: false,
    current: receipt(date, "120.12345"),
    previous: { ...earlier, date_from: earlier.date, count: 1, receipts: [earlier] },
    delta: "20.12345",
    percent: "20.12345",
  };
});

export async function verifyPurchasePrices(context, meta) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let stage = "pending";
  try {
    await page.clock.install({ time: new Date("2026-10-09T12:00:00Z") });
    await page.route("**/api/me", (route) => route.fulfill({
      json: { ...meta, warehouse_scope: { mode: "all", warehouse_ids: [] } },
    }));
    await page.route("**/api/purchase-prices?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      const recent = params.get("recent_only") === "true";
      if (recent) assert.equal(params.get("recent_period"), "month");
      assert.equal(params.get("include_impact"), "true");
      for (const key of ["sort", "page", "product", "threshold", "direction", "department_id"]) {
        assert.equal(params.has(key), false, key);
      }
      const reported = rows.filter((row) => !recent || row.current.date >= cutoff);
      return route.fulfill({ json: {
        kind: params.get("kind"), exclude_household: params.get("exclude_household") === "true",
        recent_only: recent, recent_since: cutoff, rows: reported, history_size: 6,
        stats: { observations: reported.length, no_previous: 0, invalid: 0, unchanged: 0, short_history: reported.length },
        impact_period: stage === "pending" ? { status: "pending" } : {
          status: "ready", target_end: "2026-10-08",
          start: stage === "fallback" ? "2026-09-08" : "2026-09-09",
          end: stage === "fallback" ? "2026-10-07" : "2026-10-08",
          coverage: { complete: true, loaded_days: 30, days: 30, missing_dates: [], partial_dates: [], mismatch_dates: [] },
        },
      } });
    });
    await page.route("**/api/purchase-prices/history?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      const row = rows.find((candidate) => candidate.product_id === params.get("product_id"));
      assert.ok(row);
      assert.equal(params.get("unit_id"), row.unit_id);
      assert.equal(params.get("linked"), "false");
      assert.equal(params.has("recent_only") || params.has("recent_period"), false);
      return route.fulfill({ json: row });
    });
    await page.route("**/api/resources/products/**", (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1);
      const row = rows.find((candidate) => candidate.product_id === id);
      assert.ok(row);
      return route.fulfill({ json: { header: { id, name: row.product }, items: [], columns: [], provenance: null } });
    });

    await page.goto(reportUrl);
    const recent = page.getByRole("checkbox", { name: /Были поступления за последний месяц/ });
    const heading = (count) => page.getByRole("heading", { name: "Закупочные цены · " + count, exact: true });
    const firstItem = page.locator("table tbody tr").first();
    await heading(53).waitFor();
    assert.equal(await recent.isChecked(), true);
    await firstItem.getByRole("link", { name: "Ингредиент 53", exact: true }).waitFor();
    await page.getByRole("button", { name: "Сначала ранние поступления" }).click();
    await firstItem.getByRole("link", { name: "Ингредиент 1", exact: true }).waitFor();
    await recent.click();
    await heading(54).waitFor();
    assert.equal(await recent.isChecked(), false);
    await firstItem.getByRole("link", { name: "Ингредиент 0", exact: true }).waitFor();
    await recent.click();
    await heading(53).waitFor();
    assert.equal(await recent.isChecked(), true);
    await firstItem.getByRole("button", { name: /Сравнение за один день закупок/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("cell", { name: "15.07.2026", exact: true }).waitFor();
    await dialog.getByRole("link", {name: "Накладная №2026-07-15", exact: true}).waitFor();
    await dialog.getByRole("link", {name: "Накладная №2026-09-09", exact: true}).waitFor();
    await dialog.getByRole("button", { name: "Закрыть сравнение накладных" }).click();
    await dialog.waitFor({ state: "hidden" });

    await page.getByRole("combobox", { name: "Направление", exact: true }).click();
    await page.getByRole("option", { name: "Подорожало", exact: true }).click();
    await page.getByRole("button", { name: "Далее", exact: true }).click();
    const secondPage = page.getByText("51–53 из 53", { exact: true });
    await secondPage.waitFor();
    const saved = page.url();
    assert.equal(new URL(saved).searchParams.get("direction"), "rise");
    assert.equal(new URL(saved).searchParams.get("sort"), "date_asc");
    const productName = await firstItem.getByRole("link").innerText();
    const savedProduct = firstItem.getByRole("link", { name: productName, exact: true });
    for (const browserBack of [false, true]) {
      await savedProduct.click();
      const back = page.getByRole("link", { name: "Назад к закупочным ценам" });
      await back.waitFor();
      if (browserBack) await page.goBack();
      else await back.click();
      await secondPage.waitFor();
      await savedProduct.waitFor();
      assert.equal(page.url(), saved);
    }
    await page.reload();
    await secondPage.waitFor();
    await page.getByText("Расчёт обновляется", { exact: true }).waitFor();
    await page.bringToFront();
    assert.equal(await page.evaluate(() => document.hidden), false);
    for (const [nextStage, displayedEnd] of [["fallback", "07.10.2026"], ["ready", "08.10.2026"]]) {
      stage = nextStage;
      const refreshed = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/purchase-prices");
      await page.clock.fastForward(121_000);
      await refreshed;
      await page.getByText(/Влияние за неделю — оценка по техкартам и продажам/).filter({ hasText: displayedEnd }).waitFor();
      await secondPage.waitFor();
      await savedProduct.waitFor();
      assert.equal(page.url(), saved);
    }

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /CSV · все найденные/ }).click(),
    ]);
    const stream = await download.createReadStream();
    stream.setEncoding("utf8");
    let csv = "";
    for await (const chunk of stream) csv += chunk;
    const lines = csv.trim().split("\r\n");
    assert.equal(lines.length, 54);
    assert.match(lines[1], /"Ингредиент 1"/);
    assert.match(lines.at(-1), /"Ингредиент 53"/);
    assert.match(csv, /"120,12345"/);
    assert.doesNotMatch(csv, /"Ингредиент 0"/);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

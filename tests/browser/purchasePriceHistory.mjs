import assert from "node:assert/strict";

function purchase(date, price, quantities) {
  const lines = quantities.map((amount, index) => ({
    document_id: `invoice-${date}-${index + 1}`,
    document_number: `${date}/${index + 1}`,
    num: index + 1,
    num_occurrence: 1,
    supplier: "Поставщик " + date,
    store: "Склад тестового ресторана",
    department: null,
    amount: String(amount),
    price: String(price),
    sum: String(amount * price),
    last_seen_at: date,
  }));
  const amount = quantities.reduce((total, value) => total + value, 0);
  return {
    date,
    price: String(price),
    amount: String(amount),
    sum: String(amount * price),
    lines,
  };
}

export function withPriceComparison(row) {
  const earlier = purchase("2026-10-01", 80, [5]);
  const later = purchase("2026-10-02", 100, [5, 10]);
  // Two invoice lines belong to the first document, so the disclosure still counts two invoices.
  const first = later.lines[0];
  later.lines.splice(
    0,
    1,
    { ...first, amount: "2", sum: "200" },
    { ...first, num: 2, amount: "3", sum: "300" },
  );
  return {
    ...row,
    current: purchase("2026-10-09", 114, [10]),
    previous: {
      date_from: earlier.date,
      date: later.date,
      count: 2,
      amount: "20",
      sum: "1900",
      price: "95",
      receipts: [earlier, later],
    },
    delta: "19",
    percent: "20",
  };
}

export async function verifyPriceComparison(page, productName) {
  const originalViewport = page.viewportSize();
  try {
    for (const { width, height } of [
      { width: 1280, height: 660 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width, height });
      await page
        .getByRole("button", {
          name: "Динамика цен по сети: " + productName,
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      const summary = dialog.getByRole("region", {
        name: "Сравнение закупочной цены",
      });
      await summary.waitFor();
      const text = (await summary.innerText()).replace(/\s+/g, " ");
      for (const value of [
        /114\s*₽/,
        /[+↑]\s*19\s*₽/,
        /\+?20\s*%/,
        /95\s*₽/,
        /Средневзвешенн/i,
        /2 поступления/,
        /09\.10\.2026/,
        /10\s*кг/,
        /20\s*кг/,
      ])
        assert.match(text, value);

      const chart = dialog.getByRole("img", {
        name: "Динамика закупочной цены: " + productName,
      });
      const xs = await chart
        .locator("circle")
        .evaluateAll((points) =>
          points.map((point) => Number(point.getAttribute("cx"))),
        );
      assert.equal(xs.length, 3);
      assert.ok(xs[1] > xs[0]);
      assert.ok(
        Math.abs((xs[2] - xs[1]) / (xs[1] - xs[0]) - 7) < 0.05,
        "chart spacing follows 1 and 7 days",
      );

      const body = dialog.locator(".purchase-modal-body");
      const initial = await summary.boundingBox();
      assert.ok(
        initial && initial.x >= 0 && initial.x + initial.width <= width + 1,
      );
      const scrolled = await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return el.scrollTop;
      });
      assert.ok(scrolled > 80);
      const fixed = await summary.boundingBox();
      assert.ok(fixed && fixed.y >= 0 && fixed.y + fixed.height <= height);
      assert.ok(
        Math.abs(fixed.y - initial.y) < 35,
        "price summary stays at the top during actual body scrolling",
      );
      assert.ok(
        await summary.evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          );
        }),
        "price summary stays above scrolling content",
      );

      const receipts =
        width > 600
          ? dialog.locator(".price-history-table tbody tr")
          : dialog.locator(".price-receipt-list > li");
      await receipts.first().waitFor();
      assert.equal(await receipts.count(), 2);
      assert.match(await receipts.first().innerText(), /02\.10\.2026/);
      assert.match(await receipts.last().innerText(), /01\.10\.2026/);
      const bundle = receipts.first().getByText("2 накладные", { exact: true });
      const invoice = (container, number) =>
        container.getByRole("link", { name: "№" + number, exact: true });
      assert.equal(
        await invoice(receipts.first(), "2026-10-02/1").isVisible(),
        false,
      );
      await bundle.click();
      for (const suffix of [1, 2]) {
        const link = invoice(receipts.first(), "2026-10-02/" + suffix);
        assert.equal(
          await link.getAttribute("href"),
          "/invoices/invoice-2026-10-02-" + suffix,
        );
        assert.ok(await link.isVisible());
      }
      await bundle.click();
      await invoice(receipts.first(), "2026-10-02/1").waitFor({
        state: "hidden",
      });
      assert.ok(await invoice(receipts.last(), "2026-10-01/1").isVisible());

      const latest = dialog
        .locator("section")
        .filter({
          has: page.getByRole("heading", {
            name: "Последнее поступление",
            exact: true,
          }),
        });
      await latest.getByText("Поставщик 2026-10-09", { exact: true }).waitFor();
      assert.ok(
        await latest
          .getByText("Склад тестового ресторана", { exact: true })
          .isVisible(),
      );
      assert.equal(
        await latest
          .getByRole("link", { name: "Накладная №2026-10-09/1", exact: true })
          .getAttribute("href"),
        "/invoices/invoice-2026-10-09-1",
      );
      const original = latest.getByText(/Исходная цена iiko/);
      assert.equal(await original.isVisible(), false);
      await latest.getByText("Подробности", { exact: true }).click();
      await original.waitFor();
      assert.ok(await latest.getByText(/Строка 1/).isVisible());
      assert.ok(await latest.getByText(/Загружено/).isVisible());
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
}

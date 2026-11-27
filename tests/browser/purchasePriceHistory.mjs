import assert from "node:assert/strict";

function purchase(date, price, documents) {
  const lines = documents.map(
    ({ amount, supplier, store, department = null }, index) => ({
      document_id: `invoice-${date}-${index + 1}`,
      document_number: `${date}/${index + 1}`,
      num: index + 1,
      num_occurrence: 1,
      supplier,
      store,
      department,
      receipt_route: "direct",
      amount: String(amount),
      price: String(price),
      sum: String(amount * price),
      last_seen_at: date,
    }),
  );
  const amount = documents.reduce(
    (total, document) => total + document.amount,
    0,
  );
  return {
    date,
    price: String(price),
    amount: String(amount),
    sum: String(amount * price),
    lines,
  };
}

export function withPriceComparison(row) {
  const earlier = purchase("2026-10-01", 80, [
    { amount: 5, supplier: null, store: null },
  ]);
  const later = purchase("2026-10-02", 100, [
    { amount: 10, supplier: "Молочный дом", store: "Холодильник бара" },
    {
      amount: 5,
      supplier: "Ферма Заречье",
      store: "Склад кухни",
      department: "Ресторан у моря",
    },
  ]);
  // Input order is №10 then №2. №2 has three lines delivered to two stores.
  const [milk, farm] = later.lines;
  later.lines = [
    { ...milk, document_number: "10", price: "114", sum: "1140" },
    {
      ...farm,
      document_number: "2",
      num: 1,
      amount: "2",
      price: "60",
      sum: "120",
    },
    {
      ...farm,
      document_number: "2",
      num: 2,
      store: "Склад кондитерской",
      amount: "1",
      price: "80",
      sum: "80",
    },
    {
      ...farm,
      document_number: "2",
      num: 3,
      amount: "2",
      price: "80",
      sum: "160",
    },
  ];
  return {
    ...row,
    current: purchase("2026-10-09", 114, [
      {
        amount: 10,
        supplier: "Крымская маслодельня",
        store: "Склад ресторана",
        department: "Ресторан в центре",
      },
    ]),
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

const priorInvoices = [
  {
    date: "02.10.2026",
    number: "2",
    id: "invoice-2026-10-02-2",
    supplier: "Ферма Заречье",
    stores: ["Склад кухни", "Склад кондитерской"],
    department: "Ресторан у моря",
    price: "72",
    amount: "5",
    sum: "360",
  },
  {
    date: "02.10.2026",
    number: "10",
    id: "invoice-2026-10-02-1",
    supplier: "Молочный дом",
    stores: ["Холодильник бара"],
    price: "114",
    amount: "10",
    sum: "1 140",
  },
  {
    date: "01.10.2026",
    number: "2026-10-01/1",
    id: "invoice-2026-10-01-1",
    supplier: "Не указан",
    stores: [],
    price: "80",
    amount: "5",
    sum: "400",
  },
];

function normalized(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function verifyInvoiceRows(dialog, desktop) {
  const rows = desktop
    ? dialog.locator(".price-history-table tbody tr")
    : dialog
        .getByRole("list", { name: "Предыдущие накладные", exact: true })
        .getByRole("listitem");
  await rows.first().waitFor();
  assert.equal(await rows.count(), priorInvoices.length);
  await dialog
    .getByRole("heading", { name: "Предыдущие накладные · 3", exact: true })
    .waitFor();
  if (desktop) {
    const headers = await dialog.getByRole("columnheader").allInnerTexts();
    assert.deepEqual(headers.slice(1, 3), ["Поставщик", "Склад приёмки"]);
  }
  for (const [index, expected] of priorInvoices.entries()) {
    const row = rows.nth(index);
    const link = row.getByRole("link");
    assert.equal(await link.count(), 1);
    assert.ok(await link.isVisible());
    assert.equal(normalized(await link.innerText()), "№" + expected.number);
    assert.equal(await link.getAttribute("href"), "/invoices/" + expected.id);
    let storeText;
    if (desktop) {
      const cells = (await row.getByRole("cell").allInnerTexts()).map(
        normalized,
      );
      const [date, supplier, warehouse, route, price, amount, sum] = cells;
      assert.equal(route, "Прямая закупка у поставщика");
      assert.deepEqual(
        [date, supplier, price, amount, sum],
        [
          expected.date,
          expected.supplier,
          expected.price,
          expected.amount,
          expected.sum,
        ],
      );
      storeText = warehouse;
      if (!expected.stores.length) assert.equal(warehouse, "Не указан");
    } else {
      const card = normalized(await row.innerText());
      for (const value of [
        expected.date,
        expected.supplier,
        expected.price + " ₽/кг",
        expected.amount + " кг",
        expected.sum + " ₽",
      ])
        assert.ok(card.includes(value), value + " in " + card);
      assert.ok(card.includes("Поставщик"));
      assert.match(card, /Склад(?:ы)? приёмки/);
      if (!expected.stores.length)
        assert.match(card, /Склад приёмки\s*:?\s*Не указан/);
      storeText = card;
    }
    if (expected.department) assert.ok(storeText.includes(expected.department));
    for (const store of priorInvoices.flatMap((entry) => entry.stores)) {
      assert.equal(
        storeText.split(store).length - 1,
        Number(expected.stores.includes(store)),
        `Накладная №${expected.number}, склад «${store}»`,
      );
    }
  }
}

async function verifyInvoiceCsv(page, dialog) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "CSV истории", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  stream.setEncoding("utf8");
  let csv = "";
  for await (const chunk of stream) csv += chunk;
  const records = csv.trim().split("\r\n").slice(1);
  assert.equal(records.length, 1 + priorInvoices.length);
  assert.ok(records[0].includes("invoice-2026-10-09-1"));
  assert.ok(records[0].includes("Крымская маслодельня"));
  for (const [index, expected] of priorInvoices.entries()) {
    const record = records[index + 1];
    assert.ok(record.includes(expected.id));
    const fields = record.split('";"');
    const numeric = fields
      .slice(1, 4)
      .map((value) => Number(value.replace(",", ".")));
    assert.deepEqual(numeric, [
      Number(expected.price),
      Number(expected.amount),
      Number(expected.sum.replaceAll(" ", "")),
    ]);
    for (const store of expected.stores) assert.ok(fields[8].includes(store));
  }
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

      await verifyInvoiceRows(dialog, width > 600);
      if (width > 600) {
        assert.ok(
          await dialog
            .getByRole("columnheader", { name: "Поставщик", exact: true })
            .isVisible(),
        );
        await verifyInvoiceCsv(page, dialog);
      }

      const latest = dialog.locator("section").filter({
        has: page.getByRole("heading", {
          name: "Последнее поступление",
          exact: true,
        }),
      });
      assert.match(
        (await latest.innerText()).replace(/\s+/g, " "),
        /Поставщик\s*:?\s*Крымская маслодельня/,
      );
      const latestText = normalized(await latest.innerText());
      for (const field of [
        "Склад приёмки",
        "Ресторан в центре",
        "Склад ресторана",
      ])
        assert.ok(latestText.includes(field), field + " in " + latestText);
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

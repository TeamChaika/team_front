import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  canReadPurchaseImpact,
  purchasePriceFilters,
  purchaseImpactNotice,
  purchasePriceReportPath,
  updatePurchasePriceFilters,
  waitingForPurchaseImpact,
} from "../src/purchasePriceReport.ts";
import { csvPrice, price, signed } from "../src/purchasePriceFormat.ts";

test("sub-kopeck changes remain visible and exports preserve the API decimal", () => {
  assert.equal(price("654.4556"), "654,46");
  assert.equal(price("654.4532"), "654,45");
  assert.equal(signed("0.0024"), "рост < 0,01");
  assert.equal(signed("-0.0024"), "снижение < 0,01");
  assert.equal(signed("0"), "0");
  assert.equal(signed(null), "—");
  assert.equal(csvPrice("-0.00036671835358127976148638283073564"), "-0,00036671835358127976148638283073564");
  assert.equal(csvPrice(null), null);
});

test("only a complete prepared window ending on the target day stops refreshes", () => {
  const period = { status: "ready", end: "2026-11-23", target_end: "2026-11-24", coverage: { complete: true } };
  assert.equal(waitingForPurchaseImpact(period), true);
  assert.equal(waitingForPurchaseImpact({ ...period, end: period.target_end }), false);
  assert.equal(waitingForPurchaseImpact({ ...period, end: period.target_end, coverage: { complete: false } }), true);
  assert.equal(waitingForPurchaseImpact({ status: "pending" }), true);
});

test("warehouse scope controls impact eligibility and strips injected impact flag", () => {
  assert.equal(canReadPurchaseImpact("selected"), false);
  assert.equal(canReadPurchaseImpact("all"), true);
  assert.equal(canReadPurchaseImpact(), true);
  const path = purchasePriceReportPath(
    "rms_id=abc&include_impact=true",
    "all",
    false,
    true,
    false,
  );
  const params = new URLSearchParams(path.split("?")[1]);
  assert.equal(params.get("rms_id"), "abc");
  assert.equal(params.has("include_impact"), false);
  assert.equal(params.get("exclude_household"), "false");
  assert.equal(params.get("recent_period"), "month");
  const fullHistory = new URL(purchasePriceReportPath("", "all", true, false, false), "https://test.local");
  assert.equal(fullHistory.searchParams.get("recent_only"), "false");
});

test("price filters reset the page while keeping other selections and unrelated URL keys", () => {
  const saved = new URLSearchParams("page=8&sort=date_asc&recent_only=false&product=p1&tab=summary");
  const changed = updatePurchasePriceFilters(saved, { kind: "linked", product: null });
  assert.equal(changed.get("tab"), "summary");
  assert.equal(changed.has("page"), false);
  assert.equal(changed.has("product"), false);
  assert.equal(purchasePriceFilters(changed).kind, "linked");
  assert.equal(purchasePriceFilters(changed).recent_only, false);
  assert.equal(purchasePriceFilters(changed).sort, "date_asc");
  assert.equal(updatePurchasePriceFilters(changed, { page: 3 }).get("page"), "3");
  assert.equal(saved.get("page"), "8");
  assert.deepEqual(
    purchasePriceFilters(new URLSearchParams("kind=invalid&direction=invalid&sort=invalid&threshold=-1&page=-1")),
    purchasePriceFilters(new URLSearchParams()),
  );
});

test("receipt purchases are the default while explicit legacy modes keep their URL meaning", () => {
  assert.equal(purchasePriceFilters(new URLSearchParams()).kind, "receipts");
  for (const kind of ["all", "unlinked", "linked"]) {
    assert.equal(purchasePriceFilters(new URLSearchParams(`kind=${kind}`)).kind, kind);
  }
  const changed = updatePurchasePriceFilters(new URLSearchParams("kind=linked&page=3"), { kind: "receipts" });
  assert.equal(changed.has("kind"), false);
  assert.equal(changed.has("page"), false);
  assert.match(purchasePriceReportPath("rms_id=abc", "receipts", true, true, false), /kind=receipts/);
});

test("pending or missing prepared impact gives one update notice", () => {
  assert.equal(
    purchaseImpactNotice(true, { status: "pending" }),
    "Расчёт обновляется",
  );
  assert.equal(purchaseImpactNotice(true), "Расчёт обновляется");
  assert.equal(purchaseImpactNotice(true, { status: "ready" }), null);
  assert.equal(purchaseImpactNotice(false), null);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const stubs = {
  "./App":
    "export const useWorkspace=()=>globalThis.purchaseTestWorkspace ?? {meta:{sales_dates:[]}};",
  "./useData":
    'export function useData(path) {globalThis.purchaseTestCalls.push(path);return {data:globalThis.purchaseTestReport,error:"",loading:false,...globalThis.purchaseTestLoadState};}',
  "./AssistantContext": "export const useAssistant=()=>({open(){}});",
  "./pages":
    'export const Feedback=({children,state})=>state.loading?"Загружаем данные…":state.error||children;export const PageTitle=()=>null;',
  "./PurchaseImpact": "export const PurchaseImpact=()=>null;",
  "./PurchaseModal": "export const PurchaseModal=()=>null;",
  "./api":
    'export { reportTimeText } from "./src/api.ts";export const dateText=v=>v;export const number=v=>v;export const csv=()=>{};',
  "react-router-dom":
    'import React from "react";export const Link=({children,to,state})=>React.createElement("a",{href:to,"data-return-query":state?.purchasePricesSearch},children);export const useSearchParams=()=>[new URLSearchParams(globalThis.purchaseTestSearch),()=>{}];',
  "@mantine/core":
    'import React from "react";export const Button=({children,disabled,onClick})=>{globalThis.purchaseTestButtons?.set(children,onClick);return React.createElement("button",{disabled},children)};export const Select=()=>null;export const Checkbox=()=>null;',
  "@mantine/hooks": "export const useElementSize=()=>({ref:null,width:740});",
  "@tabler/icons-react":
    "export const IconArrowUpRight=()=>null;export const IconDownload=()=>null;",
};
const bundled = await build({
  stdin: {
    contents: `
      import { PurchasePrices, PriceDetails } from "./src/PurchasePrices";
      import { LiveDataNotice, SalesDataNotice } from "./src/LiveDataNotice";
      import { renderToStaticMarkup } from "react-dom/server";
      import React from "react";
      export { csv as saveCsv } from "./src/api.ts";
      export const render = () => renderToStaticMarkup(React.createElement(PurchasePrices));
      export const renderDetails = (row, scope, kind) => renderToStaticMarkup(React.createElement(PriceDetails, { row, scope, kind }));
      export const liveNotice = source => renderToStaticMarkup(React.createElement(LiveDataNotice, { source }));
      export const salesNotice = (data, onRefresh) => renderToStaticMarkup(React.createElement(SalesDataNotice, { data, onRefresh }));
    `,
    resolveDir: root,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  define: { "import.meta.env.VITE_API_BASE_URL": "undefined", BroadcastChannel: "undefined" },
  write: false,
  banner: {
    js: `import {createRequire} from "node:module";const require=createRequire(${JSON.stringify(new URL("../package.json", import.meta.url).href)});`,
  },
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "report-test-stubs",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(stubs, args.path)
            ? { path: args.path, namespace: "stub" }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: stubs[args.path],
          resolveDir: root,
        }));
      },
    },
  ],
});
const { render, renderDetails, liveNotice, salesNotice, saveCsv } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
test("CSV retains numeric negative decimals while escaping spreadsheet formulas", async () => {
  let href;
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ click() { href = this.href; } }) };
  try {
    saveCsv("Закупки", [{ key: "price", label: "Цена" }, { key: "item", label: "Товар" }], [
      { price: csvPrice("-0.00002400001"), item: "=TEXT()" },
      { price: "-1+2", item: "-00024" },
    ], ["price"]);
    const content = await (await fetch(href)).text();
    assert.match(content, /"-0,00002400001";"'=TEXT\(\)"/);
    assert.match(content, /"'-1\+2";"'-00024"/);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
const row = {
  product_id: "p1",
  product: "Тестовый товар",
  unit_id: "kg",
  unit: "кг",
  linked: false,
  current: {
    date: "2026-10-07",
    price: "120",
    amount: "1",
    sum: "120",
    lines: [],
  },
  previous: { price: "100", count: 6, receipts: [] },
  delta: "20",
  percent: "20",
};
function renderReport(mode, period, rows = [row]) {
  globalThis.purchaseTestWorkspace = {
    meta: { warehouse_scope: { mode } },
    query: () => "rms_id=abc",
  };
  globalThis.purchaseTestCalls = [];
  globalThis.purchaseTestReport = {
    kind: "receipts",
    exclude_household: true,
    recent_only: true,
    history_size: 6,
    stats: {
      observations: 1,
      no_previous: 0,
      invalid: 0,
      unchanged: 0,
      short_history: 0,
    },
    rows,
    impact_period: period,
  };
  return render();
}
test("changing server filters shows loading until the matching report arrives and retains rows during its refresh", () => {
  try {
    globalThis.purchaseTestSearch = "recent_only=false";
    const changing = renderReport("selected");
    assert.match(changing, /Загружаем данные/);
    assert.doesNotMatch(changing, /Закупочные цены · 0|По выбранным условиям товаров не найдено|Товаров в выборке/);
    globalThis.purchaseTestReport.recent_only = false;
    globalThis.purchaseTestLoadState = { refreshing: true };
    assert.match(render(), /Тестовый товар/);
    assert.doesNotMatch(render(), /Загружаем данные/);
    globalThis.purchaseTestReport.rows = [];
    assert.match(render(), /По выбранным условиям товаров не найдено/);
  } finally {
    delete globalThis.purchaseTestSearch;
    delete globalThis.purchaseTestLoadState;
  }
});

test("latest receipts are first and saved filters, order and page are restored from the URL", () => {
  const rows = Array.from({ length: 55 }, (_, i) => ({
    ...row,
    product: `Позиция ${i}`,
    product_id: String(i),
    percent: String(i),
    current: { ...row.current, date: i === 54 ? "2026-11-14" : "2026-11-01" },
  }));
  const defaultHtml = renderReport("selected", undefined, rows);
  function before(html, first, second) {
    assert.ok(html.includes(first) && html.indexOf(first) < html.indexOf(second));
  }
  before(defaultHtml, "Позиция 54<", "Позиция 0<");
  before(defaultHtml, "Позиция 9<", "Позиция 10<");
  try {
    globalThis.purchaseTestSearch = "sort=date_asc";
    const earliest = renderReport("selected", undefined, rows.toReversed());
    before(earliest, "Позиция 0<", "Позиция 1<");
    assert.doesNotMatch(earliest, /Позиция 54</);
    globalThis.purchaseTestSearch = "sort=percent_asc&direction=rise&threshold=1&page=2";
    const restored = renderReport("selected", undefined, rows);
    assert.match(restored, /51–54 из 54/);
    assert.match(restored, /Позиция 51</);
    assert.match(restored, /data-return-query="sort=percent_asc&amp;direction=rise&amp;threshold=1&amp;page=2"/);
    assert.doesNotMatch(globalThis.purchaseTestCalls[0], /sort=|threshold=|direction=|page=/);
  } finally {
    delete globalThis.purchaseTestSearch;
  }
});
test("price totals use all matching rows even when only 50 are displayed", () => {
  const rows = Array.from({ length: 55 }, (_, i) => ({
    ...row,
    product_id: String(i),
    product: `Товар номер ${i}`,
    delta: i < 51 ? "20" : "-5",
  }));
  const html = renderReport("selected", undefined, rows);
  assert.match(html, /Товаров в выборке<\/span><strong>55<\/strong>/);
  assert.match(html, /class="price-rise">51<\/strong>/);
  assert.match(html, /class="price-fall">4<\/strong>/);
  assert.match(html, /Товар номер 49/);
  assert.doesNotMatch(html, /Товар номер 50/);
});

test("receipt mode requests prepared impact and preserves invoice history scope", () => {
  const html = renderReport("all", { status: "ready" });
  assert.match(globalThis.purchaseTestCalls[0], /kind=receipts/);
  assert.match(globalThis.purchaseTestCalls[0], /include_impact=true/);
  assert.match(html, /За неделю, ₽/);
  assert.match(html, /Не нашли поступление\? Проверьте связанные накладные/);
  globalThis.purchaseTestCalls = [];
  globalThis.purchaseTestReport = null;
  renderDetails(row, "rms_id=abc", "receipts");
  assert.match(globalThis.purchaseTestCalls[0], /kind=receipts/);
  assert.match(globalThis.purchaseTestCalls[0], /linked=false/);
  assert.match(globalThis.purchaseTestCalls[0], /rms_id=abc/);
  assert.match(globalThis.purchaseTestCalls[0], /product_id=p1/);
});

test("history identifies procurement route and hides invoices without document access", () => {
  const line = {
    document_id: "destination-1", document_number: "42", num: 1, num_occurrence: 1,
    supplier: "Внешний поставщик", store: "Склад кафе", department: "Кафе",
    amount: "1", sum: "120", price: "120", last_seen_at: "2026-10-07",
    receipt_route: "via_procurement",
  };
  globalThis.purchaseTestWorkspace = { meta: { sections: ["purchase-prices"] }, query: () => "rms_id=abc" };
  globalThis.purchaseTestCalls = [];
  globalThis.purchaseTestReport = {
    ...row,
    current: { ...row.current, lines: [line] },
    previous: { ...row.previous, receipts: [{ ...row.current, date: "2026-10-06", lines: [{ ...line, document_id: "destination-0" }] }] },
  };
  const html = renderDetails(row, "rms_id=abc", "receipts");
  assert.match(html, /Через закупающее юрлицо сети/);
  assert.match(html, /Внешний поставщик/);
  assert.match(html, /Склад кафе/);
  assert.doesNotMatch(html, /href="\/invoices\//);
  globalThis.purchaseTestWorkspace.meta.sections.push("invoices");
  assert.match(renderDetails(row, "rms_id=abc", "receipts"), /href="\/invoices\/destination-1"/);
  globalThis.purchaseTestWorkspace.meta.warehouse_capabilities = { unsupported_sections: ["invoices"] };
  assert.doesNotMatch(renderDetails(row, "rms_id=abc", "receipts"), /href="\/invoices\//);
});

test("stored data explains paused sync even when the response lacks live timestamps and cache duration", () => {
  const html = liveNotice({
    source: "stored",
    status: "sync_paused",
    stale: true,
  });
  assert.match(html, /сохранённые данные/);
  assert.match(html, /Синхронизация с iiko приостановлена/);
  assert.match(html, /Обновить/);
  assert.doesNotMatch(html, /NaN|Кеш|iiko API|занят или недоступен/);
  assert.equal(liveNotice(undefined), "");
});

test("live data keeps the current snapshot's metadata and omits missing fields", () => {
  const html = liveNotice({
    source: "iiko_api",
    stale: true,
    observed_at: "2026-11-24",
    cache_seconds: 300,
  });
  assert.match(html, /2026-11-24/);
  assert.match(html, /Кеш — 5 мин/);
  assert.match(html, /последний полученный срез/);
  const partial = liveNotice({ source: "iiko_api", stale: false });
  assert.match(partial, /iiko API/);
  assert.doesNotMatch(partial, /Кеш|NaN|недоступен|undefined/);
});

test("sales shows one local source time, including fallback and stale states", () => {
  const today = "2026-10-09";
  const period = { start: today, end: today };
  const live = { source: "iiko_api", observed_at: today + "T11:42:30Z", stale: false };
  const data_status = {
    source: "iiko_api",
    status: "ready",
    observed_at: today + "T09:15:00+03:00",
    expires_at: "2099-01-01T00:00:00Z",
  };
  globalThis.purchaseTestWorkspace = { meta: { today, sales_dates: [] } };
  globalThis.purchaseTestButtons = new Map();
  try {
    let refreshes = 0;
    const fresh = salesNotice({ ...period, live, data_status }, () => refreshes++);
    assert.match(fresh, /Данные iiko на 14:42/);
    assert.doesNotMatch(fresh, /09:15|Кеш|День ещё идёт|устарели/);
    globalThis.purchaseTestButtons.get("Обновить")();
    assert.equal(refreshes, 1);

    const statusOnly = salesNotice({ ...period, data_status });
    assert.match(statusOnly, /Данные iiko на 09:15/);
    assert.doesNotMatch(statusOnly, /Кеш|устарели/);
    const fallback = salesNotice({ ...period, live: { ...live, observed_at: null }, data_status });
    assert.match(fallback, /Данные iiko на 09:15/);
    const noTime = salesNotice({ ...period, live: { ...live, observed_at: null } });
    assert.match(noTime, /Данные iiko<\/strong>/);

    const stale = salesNotice({ ...period, live: { ...live, stale: true }, data_status });
    assert.match(stale, /14:42/);
    assert.match(stale, /Данные устарели/);
    const expired = salesNotice({ ...period, data_status: { ...data_status, expires_at: "2000-01-01T00:00:00Z" } });
    assert.match(expired, /Данные устарели/);

    const historical = salesNotice({ start: "2026-10-01", end: "2026-10-01", data_status });
    assert.match(historical, /Данные из iiko/);
    assert.match(historical, /Кеш до/);
    const paused = salesNotice({ ...period, live: { source: "stored", status: "sync_paused", stale: true }, data_status });
    assert.equal(paused, "");
  } finally {
    delete globalThis.purchaseTestWorkspace;
    delete globalThis.purchaseTestButtons;
  }
});

test("paused sync can open the most recent available earlier date without changing venue selection", () => {
  const paused = { source: "stored", status: "sync_paused", stale: true };
  const today = "2026-11-24";
  const periods = [];
  globalThis.purchaseTestButtons = new Map();
  globalThis.purchaseTestWorkspace = {
    meta: {
      today,
      sales_dates: ["2026-11-20", "2026-11-25", today, "2026-11-22"],
    },
    setPeriod: (...dates) => periods.push(dates),
  };
  try {
    const label = "Открыть 2026-11-22";
    assert.match(liveNotice(paused), /Открыть 2026-11-22/);
    globalThis.purchaseTestButtons.get(label)();
    assert.deepEqual(periods, [["2026-11-22", "2026-11-22"]]);
    assert.doesNotMatch(
      liveNotice({ source: "iiko_api", stale: true }),
      /Открыть/,
    );
    globalThis.purchaseTestWorkspace.meta.sales_dates = [today, "2026-11-25"];
    assert.doesNotMatch(liveNotice(paused), /Открыть/);
  } finally {
    delete globalThis.purchaseTestButtons;
    delete globalThis.purchaseTestWorkspace;
  }
});
test("opening unrestricted report makes one prepared request and preserves prices/CSV while pending", () => {
  const html = renderReport("all", { status: "pending" });
  assert.equal(globalThis.purchaseTestCalls.length, 1);
  assert.match(globalThis.purchaseTestCalls[0], /include_impact=true/);
  assert.match(html, /Тестовый товар/);
  assert.equal(html.match(/Расчёт обновляется/g)?.length, 1);
  assert.match(html, /<button>CSV · все найденные<\/button>/);
  assert.doesNotMatch(html, /Рассчитываем|Ошибка расчёта|Повторить расчёт/);
});
test("restricted opening makes one plain request and exposes no impact action", () => {
  const html = renderReport("selected");
  assert.equal(globalThis.purchaseTestCalls.length, 1);
  assert.doesNotMatch(globalThis.purchaseTestCalls[0], /include_impact/);
  assert.match(html, /Тестовый товар/);
  assert.match(html, /Динамика/);
  assert.doesNotMatch(
    html,
    /Блюда и влияние|price-impact-link|Расчёт обновляется/,
  );
});
test("ready report displays saved weekly amount without update notice", () => {
  row.impact = {
    weekly_delta: "140",
    included_positions: 2,
    excluded_positions: 0,
    reason: null,
  };
  const html = renderReport("all", {
    status: "ready",
    start: "2026-09-06",
    end: "2026-10-06",
  });
  assert.equal(globalThis.purchaseTestCalls.length, 1);
  assert.match(html, /\+140/);
  assert.match(html, /<button>ИИ-помощник<\/button>/);
  assert.match(html, /<button>Динамика<\/button>/);
  assert.match(html, /<button>Блюда и влияние<\/button>/);
  assert.doesNotMatch(html, /Спросить ИИ/);
  assert.doesNotMatch(html, /Расчёт обновляется/);
  delete row.impact;
});

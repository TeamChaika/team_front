import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  canReadPurchaseImpact,
  purchaseImpactNotice,
  purchasePriceReportPath,
} from "../src/purchasePriceReport.ts";

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
    'export function useData(path) {globalThis.purchaseTestCalls.push(path);return {data:globalThis.purchaseTestReport,error:"",loading:false};}',
  "./AssistantContext": "export const useAssistant=()=>({open(){}});",
  "./pages":
    "export const Feedback=({children})=>children;export const PageTitle=()=>null;",
  "./PurchaseImpact": "export const PurchaseImpact=()=>null;",
  "./PurchaseModal": "export const PurchaseModal=()=>null;",
  "./api":
    'export { reportTimeText } from "./src/api.ts";export const dateText=v=>v;export const number=v=>v;export const csv=()=>{};',
  "react-router-dom":
    'import React from "react";export const Link=({children})=>React.createElement("a",null,children);',
  "@mantine/core":
    'import React from "react";export const Button=({children,disabled,onClick})=>{globalThis.purchaseTestButtons?.set(children,onClick);return React.createElement("button",{disabled},children)};export const Select=()=>null;export const Checkbox=()=>null;',
  "@mantine/hooks": "export const useElementSize=()=>({ref:null,width:740});",
  "@tabler/icons-react":
    "export const IconArrowUpRight=()=>null;export const IconDownload=()=>null;",
};
const bundled = await build({
  stdin: {
    contents: `
      import { PurchasePrices } from "./src/PurchasePrices";
      import { LiveDataNotice, SalesDataNotice } from "./src/LiveDataNotice";
      import { renderToStaticMarkup } from "react-dom/server";
      import React from "react";
      export const render = () => renderToStaticMarkup(React.createElement(PurchasePrices));
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
const { render, liveNotice, salesNotice } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
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
    kind: "unlinked",
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
  assert.doesNotMatch(html, /Расчёт обновляется/);
  delete row.impact;
});

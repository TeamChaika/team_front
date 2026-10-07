import assert from "node:assert/strict";
import test from "node:test";
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

const root = new URL("../", import.meta.url).pathname;
const stubs = {
  "./App": "export const useWorkspace=()=>globalThis.purchaseTestWorkspace;",
  "./useData":
    'export function useData(path) {globalThis.purchaseTestCalls.push(path);return {data:globalThis.purchaseTestReport,error:"",loading:false};}',
  "./AssistantContext": "export const useAssistant=()=>({open(){}});",
  "./pages":
    "export const Feedback=({children})=>children;export const PageTitle=()=>null;",
  "./PurchaseImpact": "export const PurchaseImpact=()=>null;",
  "./PurchaseModal": "export const PurchaseModal=()=>null;",
  "./api":
    "export const dateText=v=>v;export const number=v=>v;export const csv=()=>{};",
  "react-router-dom":
    'import React from "react";export const Link=({children})=>React.createElement("a",null,children);',
  "@mantine/core":
    'import React from "react";export const Button=({children,disabled})=>React.createElement("button",{disabled},children);export const Select=()=>null;export const Checkbox=()=>null;',
  "@mantine/hooks": "export const useElementSize=()=>({ref:null,width:740});",
  "@tabler/icons-react":
    "export const IconArrowUpRight=()=>null;export const IconDownload=()=>null;",
};
const bundled = await build({
  stdin: {
    contents:
      'import {PurchasePrices} from "./src/PurchasePrices";import {renderToStaticMarkup} from "react-dom/server";import React from "react";export const render=()=>renderToStaticMarkup(React.createElement(PurchasePrices));',
    resolveDir: root,
  },
  bundle: true,
  format: "esm",
  platform: "node",
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
const { render } = await import(
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
function renderReport(mode, period) {
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
    rows: [row],
    impact_period: period,
  };
  return render();
}
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

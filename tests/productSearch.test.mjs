import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as pause } from "node:timers/promises";
import {
  currentProductRows,
  productSearchMetadata,
  serverRankedProductOptions,
  startProductSearch,
} from "../src/productSearchModel.ts";

test("server-ranked fuzzy, layout and synonym suggestions stay visible in order, without the selected fallback", () => {
  const options = [
    { value: "2", label: "Помидоры свежие" },
    { value: "1", label: "Томатная паста" },
    { value: "old", label: "Сахар" },
  ];
  for (const search of ["gjvbljhs", "помедоры", "томаты"]) {
    const visible = serverRankedProductOptions({
      options,
      search,
      ids: ["2", "1"],
    });
    assert.deepEqual(
      visible.map((p) => p.value),
      ["2", "1"],
    );
    assert.deepEqual(
      visible.map((p) => p.label),
      ["Помидоры свежие", "Томатная паста"],
    );
  }
  assert.deepEqual(serverRankedProductOptions({ options, ids: [] }), []);
});

test("query clearing and new scope/query hide previous suggestions immediately during debounce", () => {
  const result = {
    scope: "/documents/waybill/products",
    query: "помедоры",
    rows: [{ id: "p", name: "Помидоры" }],
  };
  assert.equal(
    currentProductRows(result.scope, result.query, result),
    result.rows,
  );
  for (const query of ["", "п", "томат"])
    assert.deepEqual(currentProductRows(result.scope, query, result), []);
  assert.deepEqual(
    currentProductRows("/documents/writeoff/products", result.query, result),
    [],
  );
});

test("cancelled request ignores a late response even when transport ignores abort", async () => {
  let resolveOld;
  let signal;
  const seen = [];
  const cancel = startProductSearch({
    delay: 0,
    load: (input) => {
      signal = input;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    },
    result: (rows) => seen.push(rows),
    error: (message) => seen.push(message),
  });
  await pause(10);
  cancel();
  assert.equal(signal.aborted, true);
  resolveOld([{ id: "old", name: "Старый ответ" }]);
  await pause(0);
  assert.deepEqual(seen, []);
});

test("debounce cancellation prevents loading a cleared query; current request exposes ranked rows", async () => {
  let calls = 0;
  const cancel = startProductSearch({
    delay: 20,
    load: async () => {
      calls++;
      return [];
    },
    result: () => {},
    error: () => {},
  });
  cancel();
  await pause(25);
  assert.equal(calls, 0);
  const rows = [
    { id: "2", name: "Молоко" },
    { id: "1", name: "Сливки" },
  ];
  let shown;
  startProductSearch({
    delay: 0,
    load: async () => rows,
    result: (value) => {
      shown = value;
    },
    error: assert.fail,
  });
  await pause(10);
  assert.equal(shown, rows);
});

test("secondary metadata uses real article and unit only, with commercial unit compatibility", () => {
  const product = { id: "p", name: "Молоко" };
  assert.equal(productSearchMetadata(product), "");
  assert.equal(
    productSearchMetadata({ ...product, article: "0012", unit_name: "л" }),
    "0012 · л",
  );
  assert.equal(productSearchMetadata({ ...product, unit: "кг" }), "кг");
  assert.equal(productSearchMetadata({ ...product, article: "0012" }), "0012");
  assert.equal(
    productSearchMetadata({ ...product, unit_name: "л", unit: "wrong" }),
    "л",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  writeoffMoney,
  writeoffCostSummary,
} from "../src/writeoffCostModel.ts";
import { documentPayload } from "../src/documentModel.ts";

test("creation preserves quantities and sends no client prices", () => {
  const draft = {
    store_id: "store",
    reason: "Порча",
    reason_id: 1,
    comment: "",
    items: [
      { product_id: "a", amount: "0,000125", unit_cost: "999", sum: "1000" },
    ],
  };
  assert.deepEqual(documentPayload("writeoff", draft, "request").items, [
    { product_id: "a", amount: 0.000125 },
  ]);
});

test("a known subtotal is never presented as a complete writeoff total", () => {
  const partial = { total: null, known_total: "123.45", unpriced_count: 1 };
  const result = writeoffCostSummary(partial);
  assert.equal(result.complete, false);
  assert.equal(result.total, "Нет полного расчёта");
  assert.equal(result.known, "123,5 ₽");
  assert.equal(result.missing, 1);
  assert.equal(writeoffCostSummary(null).complete, false);
});

test("complete totals use one decimal and tiny costs never appear as zero", () => {
  assert.equal(
    writeoffCostSummary({
      total: "123.45",
      known_total: "123.45",
      unpriced_count: 0,
    }).total,
    "123,5 ₽",
  );
  assert.equal(writeoffMoney("0.04"), "< 0,1 ₽");
  assert.equal(writeoffMoney("0"), "0 ₽");
  for (const value of [null, undefined, "", "NaN", Infinity])
    assert.equal(writeoffMoney(value), "—");
});

test("list labels distinguish complete, partial and unavailable estimates", async () => {
  const { writeoffListCostText } = await import("../src/writeoffCostModel.ts");
  assert.equal(
    writeoffListCostText({
      total: "2421.8",
      known_total: "2421.8",
      unpriced_count: 0,
    }),
    "Сумма: 2 421,8 ₽",
  );
  const partial = { total: null, known_total: "39923", unpriced_count: 5 };
  assert.equal(
    writeoffListCostText(partial),
    "Рассчитано: 39 923 ₽ · без расчёта: 5 поз.",
  );
  assert.equal(writeoffCostSummary(partial).label, "Рассчитано");
  assert.equal(writeoffCostSummary(partial).amount, "39 923 ₽");
  assert.equal(writeoffListCostText(null), "Сумма: нет данных");
});

test("prefetched detail refreshes a list quote only for the same current document", async () => {
  const { DocumentCache } = await import("../src/documentCache.ts");
  const { writeoffListEstimate } = await import("../src/writeoffCostModel.ts");
  const original = {
    total: null,
    known_total: "0",
    unpriced_count: 2,
    estimated_at: "2026-10-04T00:00:00Z",
  };
  const quote = {
    total: "2421.8",
    known_total: "2421.8",
    unpriced_count: 0,
    estimated_at: "2026-10-05T00:00:00Z",
  };
  const row = {
    id: 1,
    kind: "writeoff",
    version: 1,
    status: "Created",
    submission_state: "idle",
    cost_estimate: original,
  };
  const path = "/documents/writeoff/1";
  const cache = new DocumentCache(
    async () => ({ ...row, cost_estimate: quote }),
    () => 100,
  );
  let notifications = 0;
  const unsubscribe = cache.subscribe(path, () => notifications++);
  cache.prefetch(path, 60);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(notifications >= 2);
  const snapshot = cache.get(path);
  assert.equal(writeoffListEstimate(row, snapshot, 100), quote);
  assert.equal(writeoffListEstimate(row, snapshot, 161), original);
  for (const change of [
    { version: 2 },
    { status: "Sent" },
    { submission_state: "queued" },
    { id: 2 },
    { receipt_state: "accepted" },
  ])
    assert.equal(
      writeoffListEstimate({ ...row, ...change }, snapshot, 100),
      original,
    );
  assert.equal(
    writeoffListEstimate(
      {
        ...row,
        cost_estimate: { ...original, estimated_at: "2026-10-06T00:00:00Z" },
      },
      snapshot,
      100,
    ).estimated_at,
    "2026-10-06T00:00:00Z",
  );
  cache.invalidate(path, true);
  assert.equal(writeoffListEstimate(row, cache.get(path), 100), original);
  unsubscribe();
  cache.dispose();
});

test("a delayed prefetch cannot restore a quote invalidated by approval", async () => {
  const { DocumentCache } = await import("../src/documentCache.ts");
  const { writeoffListEstimate } = await import("../src/writeoffCostModel.ts");
  let resolve;
  const request = new Promise((done) => {
    resolve = done;
  });
  const original = { total: null, known_total: "10", unpriced_count: 1 };
  const row = {
    id: 1,
    kind: "writeoff",
    version: 1,
    status: "Created",
    submission_state: "idle",
    cost_estimate: original,
  };
  const cache = new DocumentCache(
    () => request,
    () => 100,
  );
  const path = "/documents/writeoff/1";
  cache.prefetch(path);
  await new Promise((done) => setTimeout(done, 0));
  cache.invalidate(path, true);
  resolve({
    ...row,
    cost_estimate: {
      total: "2421.8",
      known_total: "2421.8",
      unpriced_count: 0,
    },
  });
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(cache.get(path).data, null);
  assert.equal(writeoffListEstimate(row, cache.get(path), 100), original);
  cache.dispose();
});

test("an entirely unpriced estimate stays unavailable while a priced zero stays zero", async () => {
  const { writeoffListCostText } = await import("../src/writeoffCostModel.ts");
  const unavailable = {
    total: null,
    known_total: "0.00",
    unpriced_count: 2,
    items: [{ sum: null }, { sum: null }],
  };
  assert.equal(writeoffCostSummary(unavailable).amount, "Нет данных");
  assert.equal(
    writeoffListCostText(unavailable),
    "Сумма: нет данных · без расчёта: 2 поз.",
  );
  const pricedZero = {
    ...unavailable,
    unpriced_count: 1,
    items: [{ sum: "0.00" }, { sum: null }],
  };
  assert.equal(
    writeoffListCostText(pricedZero),
    "Рассчитано: 0 ₽ · без расчёта: 1 поз.",
  );
});

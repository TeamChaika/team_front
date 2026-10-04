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

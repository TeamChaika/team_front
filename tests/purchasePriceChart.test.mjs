import assert from "node:assert/strict";
import test from "node:test";
import { priceTimeline, visibleChartLabels } from "../src/purchasePriceChart.ts";

test("one day and seven days occupy proportional distances on the receipt timeline", () => {
  const dates = ["2026-11-09", "2026-11-10T00:00:00", "2026-11-17"];
  const positions = priceTimeline(dates, 60, 700);
  assert.deepEqual(positions, [60, 140, 700]);
  assert.deepEqual(dates, ["2026-11-09", "2026-11-10T00:00:00", "2026-11-17"]);
});

test("receipt times use restaurant time, including across calendar years", () => {
  assert.deepEqual(
    priceTimeline(["2026-12-31T21:00:00Z", "2027-01-01 06:00:00", "2027-01-01T12:00:00+03:00"], 0, 100),
    [0, 50, 100],
  );
});

test("single and coincident receipts share a centered position and invalid dates have none", () => {
  assert.deepEqual(priceTimeline(["2026-11-17"], 40, 100), [70]);
  assert.deepEqual(priceTimeline(["bad", "2026-11-17", "2026-11-17T00:00:00"], 40, 100), [null, 70, 70]);
  assert.deepEqual(priceTimeline([], 40, 100), []);
});

test("narrow layouts retain the endpoints and omit labels colliding in a dense cluster", () => {
  const xs = [55, 58, 61, 130, 211, 214];
  const visible = [...visibleChartLabels(xs, 65)].sort((a,b) => a-b);
  assert.deepEqual(visible, [0, 3, 5]);
  assert.deepEqual([...visibleChartLabels([90,90], 65)], [1]);
  assert.deepEqual([...visibleChartLabels([], 65)], []);
});

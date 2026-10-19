import { test } from "node:test";
import assert from "node:assert/strict";
import {
  indicatorCards,
  updateIndicatorCard,
  startIndicatorRefresh,
} from "../src/indicatorRefresh.ts";

const report = (value = 42, extra = {}) => ({
  status: "ready",
  source: "iiko",
  observed_at: "2026-10-19T09:00:00Z",
  current: { value },
  previous: { value: 30 },
  ...extra,
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness(request) {
  const visibility = new EventTarget();
  visibility.hidden = false;
  let snapshot = {
    queryKey: "scope-a",
    cards: { revenue: { report: report() } },
  };
  const refresh = startIndicatorRefresh({
    keys: ["revenue"],
    request,
    visibility,
    update: (key, patch) => {
      snapshot = updateIndicatorCard(snapshot, "scope-a", key, patch);
    },
    errorMessage: () => "Не удалось обновить",
  });
  return { refresh, visibility, cards: () => snapshot.cards };
}

test("same selection retains last good values during manual and periodic refresh", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const pending = [];
  const h = harness(() => new Promise((resolve) => pending.push(resolve)));
  assert.equal(h.cards().revenue.report.current.value, 42);
  assert.equal(h.cards().revenue.refreshing, true);
  pending.shift()(report(43));
  await flush();
  h.refresh.refresh("revenue");
  assert.equal(h.cards().revenue.report.current.value, 43);
  pending.shift()(report(44));
  await flush();
  t.mock.timers.tick(60_000);
  assert.equal(pending.length, 1);
  assert.equal(h.cards().revenue.report.current.value, 44);
  h.refresh.stop();
});

test("changed restaurant, period or filter cannot expose the previous selection", () => {
  const snapshot = {
    queryKey: "scope-a",
    cards: { revenue: { report: report() } },
  };
  for (const selection of ["restaurant-b", "period-b", "filter-b"]) {
    assert.deepEqual(indicatorCards(snapshot, selection), {});
    const next = updateIndicatorCard(snapshot, selection, "revenue", {
      refreshing: true,
    });
    assert.equal(next.cards.revenue.report, undefined);
  }
});

test("failed refresh keeps last good values with a separate error", async () => {
  const h = harness(async () => {
    throw new Error("offline");
  });
  await flush();
  assert.equal(h.cards().revenue.report.current.value, 42);
  assert.equal(h.cards().revenue.error, "Не удалось обновить");
  assert.equal(h.cards().revenue.refreshing, false);
  h.refresh.stop();
});

test("server refresh failure keeps ready report and marks it delayed", async () => {
  const h = harness(async () =>
    report(50, { stale: true, refresh_error: "provider_unavailable" }),
  );
  await flush();
  assert.equal(h.cards().revenue.report.current.value, 50);
  assert.match(h.cards().revenue.error, /Обновление задерживается/);
  assert.doesNotMatch(h.cards().revenue.error, /provider_unavailable/);
  h.refresh.stop();
});

test("hidden page pauses checks; cleanup clears interval, listener and late updates", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  let resolve;
  let signal;
  const h = harness((_key, requestSignal) => {
    calls++;
    signal = requestSignal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  resolve(report());
  await flush();
  h.visibility.hidden = true;
  t.mock.timers.tick(120_000);
  assert.equal(calls, 1);
  h.visibility.hidden = false;
  h.visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 2);
  h.refresh.stop();
  assert.equal(signal.aborted, true);
  resolve(report(999));
  await flush();
  assert.equal(h.cards().revenue.report.current.value, 42);
  t.mock.timers.tick(180_000);
  h.visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 2);
});

test("duplicate refreshes never exceed two concurrent requests", async () => {
  const visibility = new EventTarget();
  visibility.hidden = false;
  const pending = [];
  let calls = 0;
  const refresh = startIndicatorRefresh({
    keys: ["revenue", "checks", "guests"],
    visibility,
    request: async () => {
      calls++;
      return new Promise((resolve) => pending.push(resolve));
    },
    update: () => {},
    errorMessage: () => "error",
  });
  refresh.refresh("revenue");
  refresh.refresh("guests");
  assert.equal(calls, 2);
  pending.shift()(report());
  await flush();
  assert.equal(calls, 3);
  refresh.stop();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { cashShiftPage, watchSchedule } from "../src/statusSchedule.ts";

test("all cash shift days are reachable in pages of 30, starting with the most recent", () => {
  const days = Array.from({ length: 65 }, (_, i) => i + 1);
  const first = cashShiftPage(days, 1);
  const second = cashShiftPage(days, 2);
  const last = cashShiftPage(days, 5);
  assert.deepEqual(
    [first.rows.length, second.rows.length, last.rows.length],
    [30, 30, 5],
  );
  assert.equal(last.page, 3);
  assert.deepEqual(
    [...first.rows, ...second.rows, ...last.rows],
    [...days].reverse(),
  );
  assert.deepEqual(cashShiftPage([], 2), { page: 1, pages: 1, rows: [] });
});

test("polls only when visible, keeps one pending read, ignores aborted results and accepts the old full response shape", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const calls = [],
    updates = [];
  const watcher = watchSchedule(
    visibility,
    (signal) => new Promise((resolve) => calls.push({ signal, resolve })),
    (tasks) => updates.push(tasks),
    assert.fail,
  );
  assert.equal(calls.length, 0);
  visibility.hidden = true;
  t.mock.timers.tick(15_000);
  assert.equal(calls.length, 0);
  visibility.hidden = false;
  visibility.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(15_000);
  assert.equal(calls.length, 1);
  watcher.refresh();
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve({ scheduled: ["old"] });
  calls[1].resolve({ events: [], cash_shift_days: [1], scheduled: ["new"] });
  await new Promise(setImmediate);
  assert.deepEqual(updates, [["new"]]);
  t.mock.timers.tick(15_000);
  assert.equal(calls.length, 3);
  watcher.stop();
  assert.equal(calls[2].signal.aborted, true);
  calls[2].resolve({ scheduled: ["wrong scope"] });
  visibility.dispatchEvent(new Event("visibilitychange"));
  await new Promise(setImmediate);
  assert.deepEqual(updates, [["new"]]);
  assert.equal(calls.length, 3);
});

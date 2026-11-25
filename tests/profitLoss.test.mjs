import assert from "node:assert/strict";
import test from "node:test";
import {
  amountForApi,
  canChangeExpense,
  hasProfitLossAccess,
  periodForMonth,
  moscowToday,
  expenseQuery,
  financeDepartments,
} from "../src/profitLossModel.ts";

test("access comes from a primary dashboard finance grant", () => {
  for (const role of ["manager", "accountant", "owner"]) {
    assert.ok(hasProfitLossAccess(role, false));
    assert.equal(hasProfitLossAccess(role, true), false);
  }
  for (const role of [null, undefined, "", "admin"])
    assert.equal(hasProfitLossAccess(role, false), false);
});

test("Moscow month to date and past complete calendar months", () => {
  const today = moscowToday(new Date("2026-11-30T21:01:00Z"));
  assert.equal(today, "2026-12-01");
  assert.deepEqual(periodForMonth("2026-12", today), {
    start: "2026-12-01",
    end: "2026-12-01",
  });
  assert.deepEqual(periodForMonth("2024-02", today), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
});

test("money keeps decimal precision and rejects more than kopecks", () => {
  assert.equal(amountForApi("1 230,20"), "1230.20");
  assert.equal(amountForApi("0,01"), "0.01");
  for (const value of ["0", "-1", "1,005", "NaN", "1e6", ""])
    assert.equal(amountForApi(value), null);
});

test("paid manager entries and cancelled entries have no change actions", () => {
  const editable = { can_edit: true, cancelled: false, paid_date: null };
  assert.equal(canChangeExpense("manager", editable), true);
  assert.equal(
    canChangeExpense("manager", { ...editable, paid_date: "2026-11-25" }),
    false,
  );
  assert.equal(
    canChangeExpense("accountant", { ...editable, paid_date: "2026-11-25" }),
    true,
  );
  assert.equal(
    canChangeExpense("owner", { ...editable, cancelled: true }),
    false,
  );
  assert.equal(
    canChangeExpense("manager", { ...editable, can_edit: false }),
    false,
  );
});

test("empty venue selection cannot accidentally request all venues", () => {
  const range = { start: "2026-11-01", end: "2026-11-25" };
  assert.equal(expenseQuery(range, []), null);
  assert.equal(expenseQuery({ ...range, end: "2026-10-31" }, ["a"]), null);
  const params = new URLSearchParams(
    expenseQuery(range, ["active", "offline"]),
  );
  assert.deepEqual(params.getAll("department_id"), ["active", "offline"]);
  assert.equal(params.get("start"), range.start);
});

test("only restaurant DEPARTMENT IDs are sent in All, including restaurants with sync off", () => {
  const departments = financeDepartments([
    { id: "restaurant", type: "DEPARTMENT", sync_enabled: false },
    { id: "warehouse", type: "CENTRALSTORE" },
    { id: "factory", type: "MANUFACTURE" },
    { id: "unknown" },
  ]);
  const q = expenseQuery(
    { start: "2026-11-01", end: "2026-11-25" },
    departments.map((v) => v.id),
  );
  assert.deepEqual(new URLSearchParams(q).getAll("department_id"), [
    "restaurant",
  ]);
});

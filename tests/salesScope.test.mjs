import assert from "node:assert/strict";
import { test } from "node:test";
import { salesDefaultDepartments } from "../src/salesScope.ts";

const today = "2026-11-24";
const meta = {
  today,
  live_sales_enabled: true,
  departments: [
    { id: "north", sync_enabled: true },
    { id: "south", sync_enabled: false },
  ],
};

test("only periods including today default to departments permitted to refresh", () => {
  assert.deepEqual(salesDefaultDepartments(meta, today, today), ["north"]);
  assert.deepEqual(salesDefaultDepartments(meta, "2026-11-01", today), [
    "north",
  ]);
  assert.equal(salesDefaultDepartments(meta, "2026-11-01", "2026-11-23"), null);
  assert.equal(salesDefaultDepartments(meta, "2026-11-25", "2026-11-30"), null);
});

test("all-enabled scopes and stored-only reports keep their original scope", () => {
  for (const overrides of [
    { departments: [meta.departments[0]] },
    { live_sales_enabled: false },
  ])
    assert.equal(
      salesDefaultDepartments({ ...meta, ...overrides }, today, today),
      null,
    );
});

test("limited warehouse grants use synced accessible departments for live sales and the full grant for history", () => {
  const granted = {
    ...meta,
    warehouse_scope: { mode: "selected", warehouse_ids: ["store"] },
  };
  assert.deepEqual(salesDefaultDepartments(granted, today, today), ["north"]);
  assert.equal(
    salesDefaultDepartments(granted, "2026-11-23", "2026-11-23"),
    null,
  );
});

test("unknown department policy is distinct from a known empty live selection", () => {
  const partial = {
    ...meta,
    departments: [meta.departments[1], { id: "other" }],
  };
  assert.equal(salesDefaultDepartments(partial, today, today), null);
  assert.deepEqual(
    salesDefaultDepartments(
      { ...meta, departments: [meta.departments[1]] },
      today,
      today,
    ),
    [],
  );
});

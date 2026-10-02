import { test } from "node:test";
import assert from "node:assert/strict";
import { todayReservation } from "../src/depositDates.ts";

test("reservation Today changes at Crimea midnight, independently of device timezone", () => {
  assert.equal(todayReservation(new Date("2026-10-01T20:59:59Z")), "2026-10-01");
  assert.equal(todayReservation(new Date("2026-10-01T21:00:00Z")), "2026-10-02");
  assert.equal(todayReservation(new Date("2026-12-31T21:00:00Z")), "2027-01-01");
});

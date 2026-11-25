import assert from "node:assert/strict";
import test from "node:test";
import * as model from "../src/documentModel.ts";

const waybill = {
  kind: "waybill",
  status: "Created",
  submission_state: "idle",
  receipt_state: "none",
};
const due = { ...waybill, auto_receipt_due_at: "2026-12-31T22:30:00Z" };

test("waybill deadline uses the Moscow calendar across New Year", () => {
  assert.equal(
    model.autoReceiptLabel(due, Date.parse("2026-12-29T22:00:00Z")),
    "Будет принято автоматически 01.01.2027 в 01:30 МСК",
  );
  assert.equal(
    model.autoReceiptLabel(due, Date.parse("2026-12-31T20:59:59Z")),
    "Будет принято автоматически завтра в 01:30 МСК",
  );
  assert.equal(
    model.autoReceiptLabel(due, Date.parse("2026-12-31T21:00:00Z")),
    "Будет принято автоматически сегодня в 01:30 МСК",
  );
});

test("at the deadline refresh the state without claiming the receipt was completed", () => {
  const at = Date.parse(due.auto_receipt_due_at);
  assert.equal(model.documentPollDelay([due], at - 400), 400);
  assert.equal(model.autoReceiptLabel(due, at), "Срок автоприёмки наступил");
  assert.equal(model.documentPollDelay([due], at), 5000);
  assert.equal(model.documentPollDelay([due], at - 3600_000), 60_000);
});

test("ineligible and legacy responses never promise automatic receipt", () => {
  const now = Date.parse("2026-12-30T11:00:00Z");
  for (const patch of [
    { auto_receipt_due_at: undefined },
    { auto_receipt_due_at: null },
    { auto_receipt_due_at: "not-a-date" },
    { auto_receipt_due_at: "2026-12-31T22:30:00" },
    { kind: "writeoff" },
    { status: "Denied" },
    { submission_state: "unknown" },
    { receipt_state: "pending_sender" },
    { receipt_state: "accepted" },
    { receipt_state: "rejected" },
  ]) {
    const doc = { ...due, ...patch };
    assert.equal(model.autoReceiptLabel(doc, now), null);
    assert.equal(model.documentPollDelay([doc], now), null);
  }
  assert.equal(
    model.documentPollDelay(
      [{ ...waybill, submission_state: "queued" }, due],
      now,
    ),
    5000,
  );
});

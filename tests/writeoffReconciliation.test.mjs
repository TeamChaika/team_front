import assert from "node:assert/strict";
import test from "node:test";
import * as model from "../src/documentModel.ts";

const sent = { kind: "writeoff", status: "Sent", submission_state: "sent" };
const unknown = {
  kind: "writeoff",
  status: "Created",
  submission_state: "unknown",
};
const read = (state, iiko_status) => ({ state, iiko_status });

test("writeoffs show the observed iiko state independently of transport", () => {
  for (const [status, label] of [
    ["NEW", "Новый"],
    ["PROCESSED", "Проведён"],
    ["DELETED", "Удалён"],
  ]) {
    assert.equal(
      model.writeoffReconciliationLabel({
        ...unknown,
        iiko_reconciliation: read("matched", status),
      }),
      label,
    );
  }
  assert.equal(model.documentWorkflowLabel(unknown), "Согласован");
});

test("failed matches and unchecked documents never claim a posted act", () => {
  assert.equal(
    model.writeoffReconciliationLabel({ ...sent, iiko_reconciliation: null }),
    "Ещё не проверен",
  );
  assert.equal(model.writeoffReconciliationLabel(sent), null);
  assert.match(
    model.writeoffReconciliationLabel({
      ...sent,
      iiko_reconciliation: read("not_found", null),
    }),
    /не найден/i,
  );
  assert.match(
    model.writeoffReconciliationLabel({
      ...sent,
      iiko_reconciliation: read("ambiguous", null),
    }),
    /несколько/i,
  );
  for (const doc of [
    { ...sent, kind: "waybill" },
    { ...sent, submission_state: "idle", status: "Created" },
  ]) {
    assert.equal(
      model.writeoffReconciliationLabel({ ...doc, iiko_reconciliation: null }),
      null,
    );
  }
});

test("missing products, zero and small decimal quantities remain distinguishable", () => {
  assert.equal(model.reconciledQuantity(null), "Нет позиции");
  assert.equal(model.reconciledQuantity(0), "0");
  assert.equal(model.reconciledQuantity("0.000125"), "0,000125");
  assert.equal(model.reconciledQuantity("0.250000"), "0,25");
});

test("different decimal quantities retain their individual digits from iiko", () => {
  assert.equal(
    model.reconciledQuantity("1.234567891234567891"),
    "1,234567891234567891",
  );
  assert.equal(
    model.reconciledQuantity("1.234567891234567892"),
    "1,234567891234567892",
  );
  assert.equal(
    model.reconciledQuantity("-1234.00000000000000000000100"),
    "-1\u00a0234,000000000000000000001",
  );
});

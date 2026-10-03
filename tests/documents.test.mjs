import assert from "node:assert/strict";
import test from "node:test";
import {
  actionSnapshot,
  documentPayload,
  receiptPayload,
  receiptSnapshot,
  submissionLabel,
} from "../src/documentModel.ts";

const draft = {
  store_id: "sender",
  counteragent_id: "receiver",
  comment: "",
  items: [{ product_id: "product", name: "Product", amount: "0,000125" }],
};

test("document quantities retain small fractions without rounding", () => {
  const payload = documentPayload("waybill", draft, "request");
  assert.equal(payload.items[0].amount, 0.000125);
  assert.equal(payload.request_id, "request");
  assert.equal(payload.items[0].name, undefined);
});

test("non-positive, non-finite and duplicate items are rejected", () => {
  for (const amount of ["", 0, -1, Infinity, NaN]) {
    assert.throws(() =>
      documentPayload(
        "waybill",
        { ...draft, items: [{ product_id: "x", amount }] },
        "request",
      ),
    );
  }
  assert.throws(() =>
    documentPayload(
      "waybill",
      { ...draft, items: [...draft.items, ...draft.items] },
      "request",
    ),
  );
});

test("document limits and sender/receiver equality are checked before submission", () => {
  assert.throws(() =>
    documentPayload(
      "waybill",
      { ...draft, counteragent_id: "sender" },
      "request",
    ),
  );
  assert.throws(() =>
    documentPayload(
      "waybill",
      { ...draft, comment: "x".repeat(1001) },
      "request",
    ),
  );
  assert.throws(() =>
    documentPayload("waybill", { ...draft, items: [] }, "request"),
  );
});

test("writeoff requires a reason and does not send a recipient", () => {
  assert.throws(() => documentPayload("writeoff", draft, "request"));
  const payload = documentPayload(
    "writeoff",
    { ...draft, reason: "Expired", reason_id: 1 },
    "request",
  );
  assert.equal(payload.reason, "Expired");
  assert.equal(payload.counteragent_id, undefined);
});

test("uncertain and sent statuses do not claim a posted document", () => {
  assert.match(submissionLabel("unknown"), /провер/i);
  assert.match(submissionLabel("sending"), /отправ/i);
  assert.doesNotMatch(submissionLabel("sent"), /проведён/i);
});

test("receipt sends every original product with precise actual quantities", () => {
  const original = [
    { product_id: "a", amount: 1.5 },
    { product_id: "b", amount: 3 },
  ];
  const payload = receiptPayload(
    original,
    [
      { product_id: "a", amount: "0,000125" },
      { product_id: "b", amount: 0 },
    ],
    "receipt-id",
    7,
  );
  assert.deepEqual(payload, {
    request_id: "receipt-id",
    version: 7,
    items: [
      { product_id: "a", amount: 0.000125 },
      { product_id: "b", amount: 0 },
    ],
  });
});

test("receipt rejects missing, duplicate, invalid, all-zero and unchanged quantities", () => {
  const original = [
    { product_id: "a", amount: 1 },
    { product_id: "b", amount: 2 },
  ];
  const valid = [
    { product_id: "a", amount: 1 },
    { product_id: "b", amount: 1 },
  ];
  for (const actual of [
    valid.slice(0, 1),
    [valid[0], valid[0]],
    [
      { product_id: "a", amount: 0 },
      { product_id: "b", amount: 0 },
    ],
    [{ product_id: "a", amount: "" }, valid[1]],
    [{ product_id: "a", amount: -1 }, valid[1]],
    [{ product_id: "a", amount: Infinity }, valid[1]],
    [{ product_id: "a", amount: 1e9 + 1 }, valid[1]],
    [
      { product_id: "a", amount: 1 },
      { product_id: "b", amount: 2 },
    ],
  ])
    assert.throws(() => receiptPayload(original, actual, "receipt-id", 7));
});

test("receipt and sender action retain the reviewed version across a cache refresh", () => {
  const doc = {
    id: 5,
    number: "DJ5",
    version: 1,
    receipt_state: "pending_sender",
    items: [{ product_id: "a", name: "A", amount: 3, received_amount: 2 }],
  };
  const receipt = receiptSnapshot(doc);
  const decision = actionSnapshot(doc, "confirm_receipt");
  doc.version = 2;
  doc.items[0].amount = 7;
  doc.items[0].name = "Changed";
  assert.equal(receipt.version, 1);
  assert.equal(receipt.items[0].amount, 3);
  assert.equal(receipt.items[0].name, "A");
  assert.equal(decision.version, 1);
  assert.equal(decision.action, "confirm_receipt");
  const payload = receiptPayload(
    receipt.items,
    [{ product_id: "a", amount: 2 }],
    "id",
    receipt.version,
  );
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.items, [{ product_id: "a", amount: 2 }]);
});

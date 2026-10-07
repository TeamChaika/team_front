import assert from "node:assert/strict";
import test from "node:test";
import {
  commercialPayload,
  commercialCommand,
  commercialUncertain,
  commercialStatuses,
  commercialPartyLabel,
  commercialHistoryLabel,
} from "../src/commercialInvoiceModel.ts";
const draft = {
  store_id: "s",
  counterparty_id: "c",
  date: "2026-10-07",
  external_number: " 12 ",
  comment: "",
  items: [
    {
      product_id: "p",
      quantity: "0,125",
      price: "23,5012",
      vat_rate: "22",
      price_includes_vat: true,
      name: "Item",
      total: "999",
    },
  ],
};
test("invoice request preserves decimal precision and explicit tax mode, removes display totals", () => {
  const payload = commercialPayload(draft, "stable-id", 4);
  assert.deepEqual(payload.items, [
    {
      product_id: "p",
      quantity: "0.125",
      price: "23.5012",
      vat_rate: "22",
      price_includes_vat: true,
    },
  ]);
  assert.equal(payload.request_id, "stable-id");
  assert.equal(payload.version, 4);
  assert.equal(payload.external_number, "12");
});
test("invoice rejects incomplete, duplicate and invalid values before request", () => {
  for (const change of [
    { store_id: "" },
    { counterparty_id: "" },
    { date: "2026-02-30" },
    { date: "2026-99-99" },
    { items: [] },
    { items: [...draft.items, ...draft.items] },
  ])
    assert.throws(() => commercialPayload({ ...draft, ...change }, "id"));
  for (const change of [
    { quantity: 0 },
    { quantity: -1 },
    { quantity: "0.0001" },
    { price: "1.00001" },
    { quantity: Infinity },
    { price: "" },
    { price: -1 },
    { vat_rate: "99" },
  ])
    assert.throws(() =>
      commercialPayload(
        { ...draft, items: [{ ...draft.items[0], ...change }] },
        "id",
      ),
    );
  assert.equal(
    commercialPayload(
      { ...draft, items: [{ ...draft.items[0], price: 0, vat_rate: null }] },
      "id",
    ).items[0].price,
    "0",
  );
});
test("submit command pins reviewed version and retry uses exact prepared snapshot", () => {
  const doc = { version: 7 };
  const command = commercialCommand(doc, "request");
  doc.version = 8;
  assert.deepEqual(command, { version: 7, request_id: "request" });
  const payload = commercialPayload(draft, "request", 7);
  draft.items[0].price = "999";
  assert.equal(payload.items[0].price, "23.5012");
  assert.equal(commercialUncertain(new Error("network")), true);
  assert.equal(
    commercialUncertain(Object.assign(new Error("conflict"), { status: 409 })),
    false,
  );
  assert.equal(
    commercialUncertain(Object.assign(new Error("gateway"), { status: 502 })),
    true,
  );
});
test("states distinguish saving, acceptance and accounting posting", () => {
  assert.equal(commercialStatuses.draft, "Черновик");
  assert.doesNotMatch(commercialStatuses.accepted, /провед/i);
  assert.match(commercialStatuses.processed, /провед/i);
  assert.match(commercialStatuses.unknown, /провер/i);
});

test("purchase requires the supplier document number, sale keeps it optional", () => {
  assert.throws(
    () =>
      commercialPayload(
        { ...draft, external_number: " " },
        "request",
        undefined,
        "purchase",
      ),
    /номер.*поставщика/,
  );
  assert.equal(
    commercialPayload(
      { ...draft, external_number: "" },
      "request",
      undefined,
      "sale",
    ).external_number,
    "",
  );
  assert.equal(
    commercialPayload(draft, "request", undefined, "purchase").external_number,
    "12",
  );
});

test("counterparties remain identifiable by INN and history uses readable action names", () => {
  assert.equal(
    commercialPartyLabel({ id: "a", name: "Same Name", inn: "123" }),
    "Same Name · ИНН 123",
  );
  assert.equal(
    commercialPartyLabel({ id: "b", name: "Same Name", inn: "456" }),
    "Same Name · ИНН 456",
  );
  assert.equal(commercialPartyLabel({ id: "c", name: "No INN" }), "No INN");
  assert.equal(commercialHistoryLabel("submit"), "Отправлена в очередь iiko");
  assert.equal(commercialHistoryLabel("iiko_processed"), "Проведена в iiko");
});

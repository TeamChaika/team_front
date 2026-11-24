import assert from "node:assert/strict";
import test from "node:test";
import { purchaseInvoiceRows } from "../src/purchaseInvoiceHistory.ts";

function line(id, number, amount, sum) {
  return { document_id: id, document_number: number, amount, sum };
}

test("same-time invoices get their own quantities, amounts and weighted unit prices", () => {
  const milk = {
    ...line("a", "12", "1.25", "1.25"),
    supplier: "Молочный дом",
    num: 1,
  };
  const extra = { ...milk, num: 2, amount: "3.75", sum: "11.25" };
  const farm = { ...line("b", "27", "5", "30"), supplier: "Ферма" };
  const receipt = { date: "2026-11-10", lines: [milk, farm, extra] };
  const rows = purchaseInvoiceRows([receipt]);
  assert.deepEqual(
    rows.map((r) => [r.document_id, r.amount, r.sum, r.price]),
    [
      ["a", "5.00", "12.50", "2.5000"],
      ["b", "5", "30", "6.0000"],
    ],
  );
  assert.deepEqual(rows[0].lines, [milk, extra]);
  assert.deepEqual(rows[1].lines, [farm]);
  assert.deepEqual(receipt.lines, [milk, farm, extra]);
});

test("newest instants come first, with natural invoice numbers, UUID and missing numbers breaking ties", () => {
  const receipt = (date, id, number) => ({
    date,
    lines: [line(id, number, "1", "1")],
  });
  const receipts = [
    receipt("2026-11-10", "midnight", "1"),
    receipt("2026-11-10T09:00:00", "z", "2"),
    receipt("2026-11-10T06:00:00Z", "a", "2"),
    receipt("2026-11-10T07:00:00+01:00", "c", "10"),
    receipt("2026-11-10T06:00:00Z", "b", null),
    receipt("2026-11-09T23:30:00Z", "after-midnight", "3"),
    receipt("2026-11-11T06:00:00Z", "new", "9"),
  ];
  const expected = ["new", "a", "z", "c", "b", "after-midnight", "midnight"];
  assert.deepEqual(
    purchaseInvoiceRows(receipts).map((r) => r.document_id),
    expected,
  );
  assert.deepEqual(
    purchaseInvoiceRows(receipts.reverse()).map((r) => r.document_id),
    expected,
  );
});

test("decimal totals and half-even unit costs match invoice precision even beyond binary safe integers", () => {
  const lines = [
    line("even", "1", "2", "2.0001"),
    line("odd", "2", "2", "2.0003"),
    line("large", "3", "10000000000000000", "9007199254740993.10"),
    line("large", "3", "1", "0.20"),
    line("small", "4", "1E-3", "2.5E-4"),
  ];
  const [even, odd, large, small] = purchaseInvoiceRows([
    { date: "2026-11-10", lines },
  ]);
  assert.equal(even.price, "1.0000");
  assert.equal(odd.price, "1.0002");
  assert.equal(large.amount, "10000000000000001");
  assert.equal(large.sum, "9007199254740993.30");
  assert.equal(large.price, "0.9007");
  assert.equal(small.price, "0.2500");
});

test("zero cost is valid, absent evidence and zero quantities never produce a unit price", () => {
  const lines = [
    line("free", "1", "2.5", "0.00"),
    line("zero", "2", "0", "0"),
    line("zero", "2", "3", "40"),
    line("missing", "3", null, "8"),
    line("invalid", "4", "2", "not a decimal"),
    line("negative", "5", "1", "-2"),
  ];
  assert.deepEqual(
    purchaseInvoiceRows([{ date: "2026-11-10", lines }]).map((r) => [
      r.amount,
      r.sum,
      r.price,
    ]),
    [
      ["2.5", "0.00", "0.0000"],
      ["3", "40", null],
      [null, "8", null],
      ["2", null, null],
      ["1", null, null],
    ],
  );
  assert.deepEqual(
    purchaseInvoiceRows([{ date: "2026-11-10", lines: [] }]),
    [],
  );
});

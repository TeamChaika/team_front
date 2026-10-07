import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMobileDocumentAmount,
  parseMobileDocumentAmount,
} from "../src/mobileDocumentAmount.ts";

test("committed small quantities reopen as editable plain decimal with exact round trip", () => {
  for (const amount of [
    1e-7,
    1.234567890123456e-7,
    Number.MIN_VALUE,
    0.000125,
    0.5,
    1e9,
  ]) {
    const input = formatMobileDocumentAmount(amount);
    assert.equal(input.includes("e"), false);
    assert.equal(parseMobileDocumentAmount(input), amount);
  }
  assert.equal(formatMobileDocumentAmount(1e-7), "0,0000001");
});

test("native decimal entry accepts comma and shorthand and rejects invalid ranges", () => {
  for (const input of [",5", ".5", "0,5", " 0.5 "])
    assert.equal(parseMobileDocumentAmount(input), 0.5);
  for (const input of [
    "",
    "0",
    "-1",
    "1e-7",
    "Infinity",
    "1,2,3",
    "1000000001",
  ])
    assert.equal(parseMobileDocumentAmount(input), null);
});

test("pathological exponent text stays editable without unbounded expansion", () => {
  for (const input of ["1e-999999999", "1e+999999999"]) {
    assert.equal(formatMobileDocumentAmount(input), input);
    assert.equal(parseMobileDocumentAmount(input), null);
  }
});

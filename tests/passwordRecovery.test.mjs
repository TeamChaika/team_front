import assert from "node:assert/strict";
import test from "node:test";
import {
  recoveryCanRetry,
  recoveryTokenFromHash,
} from "../src/passwordRecoveryRules.ts";
import { newPasswordValidationError } from "../src/profileRules.ts";

test("recovery accepts exactly one correctly shaped fragment token", () => {
  const token = "Ab3_-".repeat(8) + "a_B";
  assert.equal(recoveryTokenFromHash("#token=" + token), token);
  for (const hash of [
    "",
    "?token=" + token,
    "#token=short",
    "#token=" + token + "&token=other",
    "#token=" + "a".repeat(101),
    "#token=" + "a".repeat(42) + "%20",
  ])
    assert.equal(recoveryTokenFromHash(hash), null);
});

test("unknown or spent reset outcome never retries the one-use token", () => {
  for (const status of [undefined, 400, 401, 403, 500, 503])
    assert.equal(recoveryCanRetry(status), false);
  for (const status of [422, 429]) assert.equal(recoveryCanRetry(status), true);
});

test("reset validates 8–128 characters and confirmation without old password", () => {
  assert.equal(newPasswordValidationError("a".repeat(8), "a".repeat(8)), null);
  assert.equal(
    newPasswordValidationError("a".repeat(128), "a".repeat(128)),
    null,
  );
  assert.ok(newPasswordValidationError("a".repeat(7), "a".repeat(7)));
  assert.ok(newPasswordValidationError("a".repeat(129), "a".repeat(129)));
  assert.ok(newPasswordValidationError("a".repeat(8), "b".repeat(8)));
});

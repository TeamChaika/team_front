import assert from "node:assert/strict";
import test from "node:test";
import { passwordValidationError, telegramUrl } from "../src/profileRules.ts";

test("password change requires the current password, 12–128 characters, and confirmation", () => {
  assert.match(
    passwordValidationError("", "a".repeat(12), "a".repeat(12)),
    /текущий/i,
  );
  assert.match(
    passwordValidationError("old", "a".repeat(11), "a".repeat(11)),
    /12/,
  );
  assert.match(
    passwordValidationError("old", "a".repeat(129), "a".repeat(129)),
    /128/,
  );
  assert.match(
    passwordValidationError("old", "a".repeat(12), "b".repeat(12)),
    /совпадают/i,
  );
  assert.match(
    passwordValidationError("a".repeat(12), "a".repeat(12), "a".repeat(12)),
    /отличаться/i,
  );
  assert.equal(
    passwordValidationError("old", "a".repeat(12), "a".repeat(12)),
    null,
  );
});

test("Telegram links open only HTTPS on the exact t.me host", () => {
  assert.equal(
    telegramUrl("https://t.me/chaika_bot?start=abc"),
    "https://t.me/chaika_bot?start=abc",
  );
  for (const value of [
    "http://t.me/bot",
    "https://t.me.evil.example/bot",
    "https://evil.example/t.me/bot",
    "https://user:pass@t.me/bot",
    "javascript:alert(1)",
    "bad",
  ]) {
    assert.equal(telegramUrl(value), null);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { indicatorErrorMessage } from "../src/indicatorErrors.ts";

test("paused synchronization explains how to recover instead of blaming iiko", () => {
  assert.equal(
    indicatorErrorMessage("Server policy detail", 423),
    "Синхронизация выбранного заведения отключена. Выберите другое.",
  );
});

test("provider, permission and network errors retain their actual explanation", () => {
  for (const status of [403, 503, undefined])
    assert.equal(indicatorErrorMessage("Точная причина", status), "Точная причина");
  assert.equal(
    indicatorErrorMessage(""),
    "Не удалось загрузить показатель. Повторите попытку.",
  );
});

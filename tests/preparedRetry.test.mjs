import assert from "node:assert/strict";
import test from "node:test";
import { preparedRetryDelay } from "../src/preparedRetry.ts";

const message = "Обновляем закупочные цены. Повторите через несколько секунд.";

test("prepared receipt requests retry only the known 503 three times", () => {
  for (const retry of [0, 1, 2])
    assert.equal(preparedRetryDelay({ status: 503, message }, retry), 15000);
  assert.equal(preparedRetryDelay({ status: 503, message }, 3), null);
  assert.equal(preparedRetryDelay({ status: 503, message: "Другая ошибка" }, 0), null);
  assert.equal(preparedRetryDelay({ status: 403, message }, 0), null);
  assert.equal(preparedRetryDelay(new Error(message), 0), null);
});

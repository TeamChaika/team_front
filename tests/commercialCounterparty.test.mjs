import test from "node:test";
import assert from "node:assert/strict";
import { counterpartyPayload, counterpartyPending } from "../src/commercialCounterpartyModel.ts";

const draft = { entity_type: "organization", name: " ООО Пример ", inn: "7707083893", kpp: "773601001", address: "", phone: "", email: "" };
test("switching from organization to a person does not send the old KPP and permits missing INN", () => {
  const result = counterpartyPayload({ ...draft, entity_type: "person", inn: "", name: " Тестовый покупатель " }, "same-request");
  assert.equal(result.kpp, "");
  assert.equal(result.inn, "");
  assert.equal(result.name, "Тестовый покупатель");
  assert.equal(result.request_id, "same-request");
});
test("IP cannot silently reuse ten-digit company tax ID", () => {
  assert.throws(() => counterpartyPayload({ ...draft, entity_type: "ip" }, "request"), /12 цифр/);
});
test("an unknown result remains pending and cannot become an editable new create", () => {
  for (const state of ["queued", "connecting", "sending", "unknown"]) assert.equal(counterpartyPending(state), true);
  for (const state of ["confirmed", "rejected"]) assert.equal(counterpartyPending(state), false);
});

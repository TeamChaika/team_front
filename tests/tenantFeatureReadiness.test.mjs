import test from "node:test";
import assert from "node:assert/strict";
import {
  tenantSectionReady,
  tenantFeatureAllowed,
  tenantMutationReady,
} from "../src/tenantFeatureReadiness.ts";
const ready = { state: "ready", read: true, write: true, reasons: [] };
const blocked = {
  state: "blocked",
  read: false,
  write: false,
  reasons: ["optional"],
};
test("unconfigured AI and Telegram do not hide analytics, documents or management", () => {
  const map = {
    "analytics.overview": ready,
    "documents.waybills": ready,
    "management.settings": ready,
    "assistant.chat": blocked,
    "notifications.telegram": blocked,
  };
  for (const section of ["overview", "transfers", "management"])
    assert.equal(tenantSectionReady(map, section), true);
  assert.equal(tenantFeatureAllowed(map, "assistant.chat", "read"), false);
  assert.equal(tenantSectionReady(map, "finance"), false);
  assert.equal(tenantSectionReady(map, "sales"), false);
  assert.equal(tenantMutationReady(map, "/management/venues", "POST"), true);
  assert.equal(
    tenantMutationReady(map, "/profile/telegram/link", "POST"),
    false,
  );
});
test("historical feature reads stay visible while writes and unknown features close", () => {
  const map = {
    "commercial.incoming": { ...blocked, read: true },
    "iiko.history": ready,
  };
  assert.equal(tenantSectionReady(map, "invoices"), true);
  assert.equal(
    tenantMutationReady(map, "/commercial-invoices/incoming", "POST"),
    false,
  );
  assert.equal(tenantMutationReady({}, "/management/accounts", "POST"), false);
  assert.equal(tenantMutationReady(map, "/resources/unknown", "POST"), false);
  assert.equal(tenantSectionReady(undefined, "overview"), true);
  assert.equal(
    tenantMutationReady(undefined, "/profile/password", "POST"),
    true,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  scopeIncludes,
  scopeModeIds,
  toggleScope,
  operationSettingsPayload,
} from "../src/operationSettingsModel.ts";
import {
  documentEditorCatalogs,
  copyDocumentStores,
} from "../src/documentModel.ts";

test("all includes new catalogue entries; explicit empty selection excludes every entry", () => {
  assert.equal(scopeIncludes("all", [], "new"), true);
  assert.equal(scopeIncludes("selected", [], "new"), false);
  const narrowed = toggleScope("all", [], ["a", "b"], "a", false);
  assert.deepEqual(narrowed, { mode: "selected", ids: ["b"] });
  assert.equal(scopeIncludes(narrowed.mode, narrowed.ids, "new"), false);
});
test("toggling a filtered row preserves selections outside the visible catalogue", () => {
  assert.deepEqual(
    toggleScope("selected", ["hidden", "a"], ["a"], "a", false).ids,
    ["hidden"],
  );
});
test("save carries revision and explicit empty scopes, without catalog or audit fields", () => {
  const scope = { mode: "selected", store_ids: [] };
  assert.deepEqual(
    operationSettingsPayload({
      revision: 7,
      sync: { mode: "selected", department_ids: [] },
      writeoff: scope,
      waybill: scope,
      stores: [],
      departments: [],
      updated_at: null,
      updated_by: null,
    }),
    {
      revision: 7,
      sync: { mode: "selected", department_ids: [] },
      writeoff: scope,
      waybill: scope,
    },
  );
});
const options = {
  stores: [
    { id: "old", name: "Old" },
    { id: "new", name: "New" },
  ],
  recipients: [{ id: "recipient", name: "Recipient" }],
  reasons: [],
  grants: [
    { store_id: "old", actions: ["edit", "create"] },
    { store_id: "new", actions: ["create"] },
  ],
};
test("new catalogue limits create/copy but historical edit keeps its catalogue", () => {
  const limited = {
    ...options,
    create_stores: [{ id: "new", name: "New" }],
    create_recipients: [],
  };
  assert.deepEqual(
    documentEditorCatalogs(limited, "create").stores.map((s) => s.id),
    ["new"],
  );
  assert.deepEqual(
    documentEditorCatalogs(limited, "edit").stores.map((s) => s.id),
    ["old"],
  );
  assert.deepEqual(
    copyDocumentStores(limited, {
      store_id: "old",
      counteragent_id: "recipient",
    }),
    { store_id: "", counteragent_id: "" },
  );
});
test("empty create catalogue closes creation; absent catalogue supports old servers without expanding grants", () => {
  assert.equal(
    documentEditorCatalogs({ ...options, create_stores: [] }, "create").stores
      .length,
    0,
  );
  assert.equal(documentEditorCatalogs(options, "create").stores.length, 2);
  assert.equal(
    documentEditorCatalogs(
      { ...options, create_stores: [{ id: "ungranted", name: "X" }] },
      "create",
    ).stores.length,
    0,
  );
});

test("switching selected to all clears IDs; returning to selected snapshots the current catalogue", () => {
  assert.deepEqual(scopeModeIds("selected", ["old"], ["a", "b"], "all"), []);
  assert.deepEqual(scopeModeIds("all", [], ["a", "b"], "selected"), ["a", "b"]);
  assert.deepEqual(scopeModeIds("selected", [], ["a", "b"], "selected"), []);
});
test("all scopes always send empty IDs even if a stale server snapshot retained selections", () => {
  const payload = operationSettingsPayload({
    revision: 8,
    sync: { mode: "all", department_ids: ["old"] },
    writeoff: { mode: "all", store_ids: ["old"] },
    waybill: { mode: "all", store_ids: ["other"] },
  });
  assert.deepEqual(payload, {
    revision: 8,
    sync: { mode: "all", department_ids: [] },
    writeoff: { mode: "all", store_ids: [] },
    waybill: { mode: "all", store_ids: [] },
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  venueScope,
  venueArchivePayload,
  drilldownDepartments,
} from "../src/venueArchiveModel.ts";
const venues = [
  { id: "live", name: "Live" },
  { id: "old", name: "Old", archived: true },
];
test("default scope removes archived from picker and explicit selection", () => {
  assert.deepEqual(venueScope(venues, ["old", "live", "unknown"], false), {
    venues: [venues[0]],
    selected: ["live"],
    empty: false,
  });
});
test("history opt-in restores archived venue without restoring hidden selection", () => {
  const hidden = venueScope(venues, ["old"], false);
  assert.deepEqual(venueScope(venues, hidden.selected, true).selected, []);
  assert.deepEqual(venueScope(venues, ["old"], true).selected, ["old"]);
});
test("empty all-archived scope cannot be mistaken for all venues", () => {
  assert.equal(venueScope([venues[1]], [], false).empty, true);
  assert.equal(venueScope([venues[1]], [], true).empty, false);
});
test("save carries revision and archived IDs only, preserving unrelated scopes", () => {
  assert.deepEqual(
    venueArchivePayload({
      revision: 3,
      archived_department_ids: ["z", "a", "a"],
      departments: venues,
      sync: { mode: "all" },
      updated_at: null,
    }),
    { revision: 3, archived_department_ids: ["a", "z"] },
  );
});

test("overview implicit-all drilldown retains active revenue instead of adding archived history", () => {
  const overview = venueScope(venues, [], false);
  const selected = drilldownDepartments(overview.venues, overview.selected);
  const sales = [
    { department_id: "live", revenue: 200 },
    { department_id: "old", revenue: 2000 },
  ];
  assert.equal(
    sales
      .filter(
        (sale) => !selected.length || selected.includes(sale.department_id),
      )
      .reduce((total, sale) => total + sale.revenue, 0),
    200,
  );
  assert.deepEqual(drilldownDepartments(venues, ["old"]), ["old"]);
  assert.deepEqual(
    drilldownDepartments(venueScope(venues, [], true).venues, []),
    ["live", "old"],
  );
});

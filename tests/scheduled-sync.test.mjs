import assert from "node:assert/strict";
import test from "node:test";
import {
  manualSyncControl,
  reconcileSyncRequests,
  syncRequestObserved,
} from "../src/scheduledSyncModel.ts";

const task = {
  scheduler_available: true,
  status: "succeeded",
  manual: {
    can_run: true,
    blocked_reason: null,
    remaining_seconds: 0,
    state: null,
  },
};
test("global cooldown uses server duration, unlocks at the boundary", () => {
  const cooling = {
    ...task,
    manual: {
      ...task.manual,
      can_run: false,
      blocked_reason: "cooldown",
      remaining_seconds: 600,
    },
  };
  assert.equal(manualSyncControl(cooling, 0).reason, "Повтор через 10:00");
  assert.equal(manualSyncControl(cooling, 599.2).reason, "Повтор через 0:01");
  assert.equal(manualSyncControl(cooling, 600).disabled, false);
});
test("elapsed cooldown never bypasses active work or scheduler availability", () => {
  for (const state of ["pending", "running"]) {
    assert.equal(
      manualSyncControl({ ...task, manual: { ...task.manual, state } }, 1000)
        .disabled,
      true,
    );
  }
  assert.equal(
    manualSyncControl({ ...task, status: "running" }, 1000).disabled,
    true,
  );
  assert.equal(
    manualSyncControl({ ...task, scheduler_available: false }, 1000).disabled,
    true,
  );
});
test("missing capabilities and permission denial fail closed", () => {
  assert.equal(
    manualSyncControl({ ...task, manual: undefined }, 0).disabled,
    true,
  );
  assert.equal(
    manualSyncControl(
      {
        ...task,
        manual: {
          ...task.manual,
          can_run: false,
          blocked_reason: "permission",
        },
      },
      1000,
    ).disabled,
    true,
  );
  assert.equal(
    manualSyncControl(
      { ...task, manual: { ...task.manual, can_run: false } },
      1000,
    ).disabled,
    true,
  );
  assert.equal(manualSyncControl(task, 0).disabled, false);
});

test("confirmed uncertain request is cleared so a later run gets a new identity", () => {
  const uncertain = { sales: "accepted-id", events: "not-seen-id" };
  const observed = [
    {
      ...task,
      job: "sales",
      manual: { ...task.manual, request_id: "accepted-id", state: "succeeded" },
    },
  ];
  assert.deepEqual(reconcileSyncRequests(uncertain, observed), {
    events: "not-seen-id",
  });
  assert.equal(uncertain.sales, "accepted-id");
});

test("newer persisted request also settles optimistic state after returning to tab", () => {
  const local = { id: "first", requested_at: "2026-10-04T10:00:00Z" };
  assert.equal(
    syncRequestObserved({ ...task.manual, request_id: "first" }, local),
    true,
  );
  assert.equal(
    syncRequestObserved(
      {
        ...task.manual,
        request_id: "second",
        requested_at: "2026-10-04T10:10:00Z",
      },
      local,
    ),
    true,
  );
  assert.equal(
    syncRequestObserved(
      {
        ...task.manual,
        request_id: "older",
        requested_at: "2026-10-04T09:50:00Z",
      },
      local,
    ),
    false,
  );
});

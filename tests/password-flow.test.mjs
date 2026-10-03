import assert from "node:assert/strict";
import { test } from "node:test";
import { createPasswordChangeFlow } from "../src/passwordChangeFlow.ts";
import { checkForegroundPasswordRequirement } from "../src/foregroundPasswordCheck.ts";

test("verification retry after saved password never submits it again", async () => {
  const flow = createPasswordChangeFlow();
  let submissions = 0;
  let verifications = 0;
  let savedNotifications = 0;
  const submit = async () => {
    submissions += 1;
  };
  const verify = async () => {
    verifications += 1;
    if (verifications === 1) throw new Error("/me unavailable");
  };
  const onSaved = () => {
    savedNotifications += 1;
  };

  await assert.rejects(flow.continue(submit, verify, onSaved), /unavailable/);
  assert.equal(flow.saved, true);
  await flow.continue(submit, verify, onSaved);
  assert.equal(submissions, 1);
  assert.equal(verifications, 2);
  assert.equal(savedNotifications, 1);
});

test("failed password POST leaves the form eligible for a new submission", async () => {
  const flow = createPasswordChangeFlow();
  let verifications = 0;
  await assert.rejects(
    flow.continue(
      async () => {
        throw new Error("wrong current password");
      },
      async () => {
        verifications += 1;
      },
      () => {},
    ),
    /wrong current password/,
  );
  assert.equal(flow.saved, false);
  assert.equal(verifications, 0);
});

test("late foreground response cannot gate a logged-out or different account", async () => {
  for (const currentAccount of [null, "user-b"]) {
    let resolve;
    const response = new Promise((done) => {
      resolve = done;
    });
    const controller = new AbortController();
    let gated = 0;
    let account = "user-a";
    const check = checkForegroundPasswordRequirement(
      () => response,
      (userId) => account === "user-a" && userId === "user-a",
      controller.signal,
      () => {
        gated += 1;
      },
    );
    account = currentAccount;
    resolve({ user: { id: "user-a", password_change_required: true } });
    await check;
    assert.equal(gated, 0);
  }
});

test("aborted foreground response cannot gate the workspace", async () => {
  const controller = new AbortController();
  let gated = 0;
  const check = checkForegroundPasswordRequirement(
    async () => ({ user: { id: "user-a", password_change_required: true } }),
    () => true,
    controller.signal,
    () => {
      gated += 1;
    },
  );
  controller.abort();
  await check;
  assert.equal(gated, 0);
});

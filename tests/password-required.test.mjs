import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const events = new EventTarget();
const messages = [];
globalThis.window = events;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { locks: null },
});
globalThis.BroadcastChannel = class {
  onmessage;
  postMessage(message) {
    messages.push(message);
  }
};

const bundled = await build({
  entryPoints: [new URL("../src/api.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  define: { "import.meta.env.VITE_API_BASE_URL": "undefined" },
});
const client = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

test("password-required 403 emits one gate signal without refreshing the session", async () => {
  const requested = [];
  let requiredEvents = 0;
  events.addEventListener("password-required", () => requiredEvents++);
  globalThis.fetch = async (url) => {
    requested.push(url);
    return Response.json(
      {
        detail: {
          code: "password_change_required",
          message: "Смените пароль.",
        },
      },
      { status: 403 },
    );
  };
  await assert.rejects(client.api("/sales"), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, "Смените пароль.");
    return true;
  });
  await assert.rejects(client.api("/profile/telegram"));
  assert.deepEqual(requested, ["/api/sales", "/api/profile/telegram"]);
  assert.equal(requiredEvents, 1);
  assert.deepEqual(messages, ["password-required"]);
});

test("successful refresh can require a password change without a session-lost event", async () => {
  client.clearPasswordRequirement();
  let requiredEvents = 0;
  let lostEvents = 0;
  events.addEventListener("password-required", () => requiredEvents++);
  events.addEventListener("session-lost", () => lostEvents++);
  globalThis.fetch = async () =>
    Response.json({ password_change_required: true });
  const result = await client.renewSession();
  assert.equal(result.status, 200);
  assert.equal(requiredEvents, 1);
  assert.equal(lostEvents, 0);
});

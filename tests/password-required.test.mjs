import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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
  entryPoints: [fileURLToPath(new URL("../src/api.ts", import.meta.url))],
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

test("bodyless reads omit the JSON header and writes preserve it unless explicitly overridden", async () => {
  const headers = [];
  globalThis.fetch = async (_url, init) => {
    headers.push(new Headers(init.headers));
    return Response.json({});
  };
  await client.api("/me");
  await client.api("/overview", { headers: [["Accept", "application/json"]] });
  await client.api("/health", { method: "HEAD" });
  await client.api("/auth/logout", { method: "POST" });
  await client.api("/profile", { method: "PATCH", body: "{}" });
  await client.api("/profile", {
    method: "PATCH",
    body: "{}",
    headers: new Headers({ "Content-Type": "application/merge-patch+json" }),
  });
  assert.deepEqual(
    headers.map((h) => h.get("Content-Type")),
    [
      null,
      null,
      null,
      "application/json",
      "application/json",
      "application/merge-patch+json",
    ],
  );
  assert.equal(headers[1].get("Accept"), "application/json");
});

test("the primary session starts its timer after /me, recovers immediately on 401, and renews in foreground", async (t) => {
  t.mock.timers.enable({
    apis: ["Date", "setInterval"],
    now: Date.UTC(2026, 0, 1),
  });
  const visibility = new EventTarget();
  visibility.visibilityState = "visible";
  globalThis.document = visibility;
  window.setInterval = globalThis.setInterval;
  window.clearInterval = globalThis.clearInterval;
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return Response.json({}, { status: paths.length === 1 ? 401 : 200 });
  };
  const stop = client.startSessionRenewal(false);
  try {
    assert.deepEqual(paths, []);
    await client.api("/overview");
    assert.deepEqual(paths, [
      "/api/overview",
      "/api/auth/refresh",
      "/api/overview",
    ]);
    visibility.visibilityState = "hidden";
    t.mock.timers.tick(20 * 60_000);
    assert.equal(paths.length, 3);
    visibility.visibilityState = "visible";
    visibility.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    assert.equal(paths.length, 4);
    assert.equal(paths[3], "/api/auth/refresh");
    await client.renewSession();
  } finally {
    stop();
  }
  t.mock.timers.tick(20 * 60_000);
  window.dispatchEvent(new Event("focus"));
  assert.equal(paths.length, 4);
  const stopImmediate = client.startSessionRenewal(true);
  try {
    assert.equal(paths.length, 5);
    await client.renewSession();
  } finally {
    stopImmediate();
  }
});

test("an expired session still ends when the forced refresh is declined", async () => {
  let lost = 0;
  events.addEventListener("session-lost", () => lost++, { once: true });
  const paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return Response.json({}, { status: 401 });
  };
  await assert.rejects(client.api("/me"), (error) => error.status === 401);
  assert.deepEqual(paths, ["/api/me", "/api/auth/refresh"]);
  assert.equal(lost, 1);
});

test("reused formatters preserve local date, time, precision and missing values", () => {
  assert.equal(client.dateText("2026-11-24"), "24.11.2026");
  assert.equal(
    client.dateText("2026-11-23T22:05:00Z"),
    client.dateText("2026-11-24 01:05:00"),
  );
  assert.match(client.dateText("2026-11-23T22:05:00Z"), /24\.11\.2026.*01:05/);
  assert.equal(client.dateText("pending"), "pending");
  assert.equal(client.dateText(null), "—");
  assert.equal(client.money(12), "12,00");
  assert.equal(client.number(1.23456789), "1,234568");
});

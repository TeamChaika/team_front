import { test } from "node:test";
import assert from "node:assert/strict";
function mockProperty(t, object, key, descriptor) {
  const previous = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, descriptor);
  t.after(() => {
    if (previous) Object.defineProperty(object, key, previous);
    else delete object[key];
  });
}

test("target creates unique state/nonce/PKCE proof, central URL has no password or tokens and StrictMode reuses start", async (t) => {
  const storage = new Map(),
    destinations = [];
  mockProperty(t, globalThis, "sessionStorage", {
    value: {
      setItem: (k, v) => storage.set(k, v),
      getItem: (k) => storage.get(k),
      removeItem: (k) => storage.delete(k),
    },
    configurable: true,
  });
  mockProperty(t, globalThis, "window", {
    value: {
      location: { assign: (url) => destinations.push(url) },
      history: {},
    },
    configurable: true,
  });
  const { startPlatformLogin } = await import("../src/platformSso.ts?start");
  await Promise.all([
    startPlatformLogin("company-a", "https://rc.example.org"),
    startPlatformLogin("company-a", "https://rc.example.org"),
  ]);
  assert.equal(destinations.length, 1);
  const url = new URL(destinations[0]),
    proof = JSON.parse(storage.get("restcontrol_sso_proof"));
  assert.equal(url.origin, "https://rc.example.org");
  assert.equal(url.searchParams.get("state"), proof.state);
  assert.equal(url.searchParams.get("nonce"), proof.nonce);
  assert.notEqual(proof.nonce, proof.state);
  assert.equal(url.searchParams.get("challenge").length, 43);
  assert.ok(!url.search.includes("verifier"));
  assert.ok(!url.search.includes("token"));
  assert.ok(!url.search.includes("password"));
});

test("callback binds company state nonce and erases fragment before failed exchange", async (t) => {
  let cleared = false,
    called = 0;
  mockProperty(t, globalThis, "window", {
    value: {
      location: { hash: "#sso_code=code&state=bad&nonce=nonce", pathname: "/" },
      history: {
        replaceState: () => {
          cleared = true;
        },
      },
    },
    configurable: true,
  });
  mockProperty(t, globalThis, "sessionStorage", {
    value: {
      getItem: () =>
        JSON.stringify({
          companyId: "own",
          state: "expected",
          nonce: "nonce",
          expires: Date.now() + 10000,
        }),
      removeItem: () => {},
    },
    configurable: true,
  });
  t.mock.method(globalThis, "fetch", async () => {
    called++;
    return new Response(null, { status: 200 });
  });
  const { completePlatformLogin } = await import(
    "../src/platformSso.ts?wrongproof"
  );
  await assert.rejects(
    completePlatformLogin("own", "own", "https://api.own.example"),
  );
  assert.equal(cleared, true);
  assert.equal(called, 0);
});

test("callback exchanges once on its own API using opaque proof and credentials", async (t) => {
  let removed = false,
    cleared = false,
    calls = [];
  mockProperty(t, globalThis, "window", {
    value: {
      location: {
        hash: "#sso_code=opaque&state=state&nonce=nonce",
        pathname: "/",
      },
      history: {
        replaceState: () => {
          cleared = true;
        },
      },
    },
    configurable: true,
  });
  mockProperty(t, globalThis, "sessionStorage", {
    value: {
      getItem: () =>
        JSON.stringify({
          companyId: "own",
          state: "state",
          nonce: "nonce",
          verifier: "verifier",
          expires: Date.now() + 10000,
        }),
      removeItem: () => {
        removed = true;
      },
    },
    configurable: true,
  });
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  });
  const { completePlatformLogin } = await import(
    "../src/platformSso.ts?success"
  );
  assert.deepEqual(
    await Promise.all([
      completePlatformLogin("own", "own", "https://api.own.example"),
      completePlatformLogin("own", "own", "https://api.own.example"),
    ]),
    [true, true],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(
    calls[0].url,
    "https://api.own.example/api/saas-tenant/own/auth/sso/exchange",
  );
  assert.equal(removed, true);
  assert.equal(cleared, true);
});

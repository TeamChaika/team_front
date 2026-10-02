import assert from "node:assert/strict";
import test from "node:test";
import { DocumentCache } from "../src/documentCache.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test("prefetched document opens without another request until its TTL expires", async () => {
  let calls = 0,
    time = 100;
  const cache = new DocumentCache(
    async () => ({ version: ++calls, items: ["Item"] }),
    () => time,
  );
  cache.prefetch("/waybill/1", 60);
  await tick();
  assert.equal(cache.get("/waybill/1").data.version, 1);
  await cache.load("/waybill/1", 60);
  assert.equal(calls, 1);
  time = 161;
  await cache.load("/waybill/1", 60);
  assert.equal(calls, 2);
  cache.dispose();
});

test("click during prefetch shares the existing request", async () => {
  const request = deferred();
  let calls = 0;
  const cache = new DocumentCache(() => {
    calls++;
    return request.promise;
  });
  cache.prefetch("/waybill/1");
  const opening = cache.load("/waybill/1");
  await tick();
  assert.equal(calls, 1);
  request.resolve({ items: ["Complete composition"] });
  await opening;
  assert.deepEqual(cache.get("/waybill/1").data.items, [
    "Complete composition",
  ]);
  cache.dispose();
});

test("background prefetch is bounded to two concurrent requests", async () => {
  const requests = Array.from({ length: 5 }, deferred);
  let calls = 0;
  const cache = new DocumentCache(() => requests[calls++].promise);
  for (let i = 0; i < 5; i++) cache.prefetch("/waybill/" + i);
  await tick();
  assert.equal(calls, 2);
  requests[0].resolve({});
  await tick();
  assert.equal(calls, 3);
  cache.dispose();
  requests.forEach((request) => request.resolve({}));
  await tick();
  assert.equal(calls, 3);
});

test("older request cannot overwrite the document after a mutation invalidates it", async () => {
  const old = deferred(),
    fresh = deferred();
  let calls = 0;
  const cache = new DocumentCache(() =>
    calls++ ? fresh.promise : old.promise,
  );
  const first = cache.load("/waybill/1");
  await tick();
  cache.invalidate("/waybill/1", true);
  const second = cache.load("/waybill/1");
  fresh.resolve({ version: 2, actions: [] });
  await second;
  old.resolve({ version: 1, actions: ["confirm"] });
  await first;
  assert.deepEqual(cache.get("/waybill/1").data, { version: 2, actions: [] });
  cache.dispose();
});

test("refresh of one ID does not invalidate another ID sharing its prefix", async () => {
  const cache = new DocumentCache(async () => ({ items: [] }));
  await cache.load("/waybill/1");
  await cache.load("/waybill/10");
  cache.invalidate("/waybill/1", true);
  assert.equal(cache.get("/waybill/1").expiresAt, 0);
  assert.ok(cache.get("/waybill/10").expiresAt > 0);
  cache.dispose();
});

test("permission loss removes cached private data; temporary failures keep a visible error", async () => {
  let failure;
  const cache = new DocumentCache(async () => {
    if (failure) throw Object.assign(new Error("Ошибка"), { status: failure });
    return { items: ["private"] };
  });
  await cache.load("/writeoff/1");
  failure = 503;
  cache.invalidate("/writeoff/1", true);
  await assert.rejects(cache.load("/writeoff/1"));
  assert.deepEqual(cache.get("/writeoff/1").data.items, ["private"]);
  assert.equal(cache.get("/writeoff/1").error, "Ошибка");
  failure = 403;
  await assert.rejects(cache.load("/writeoff/1"));
  assert.equal(cache.get("/writeoff/1").data, null);
  cache.dispose();
});

test("logout disposal stops pending requests from refilling a previous user cache", async () => {
  const request = deferred();
  const firstUser = new DocumentCache(() => request.promise);
  const pending = firstUser.load("/waybill/1");
  await tick();
  firstUser.dispose();
  request.resolve({ secret: "old user" });
  await pending;
  assert.equal(firstUser.get("/waybill/1").data, null);
  const nextUser = new DocumentCache(async () => ({
    items: ["other document"],
  }));
  assert.equal(nextUser.get("/waybill/1").data, null);
  await nextUser.load("/waybill/1");
  assert.deepEqual(nextUser.get("/waybill/1").data.items, ["other document"]);
  nextUser.dispose();
});

test("confirmed document disappears immediately and an older list response cannot restore it", async () => {
  const stale = deferred();
  let calls = 0;
  const cache = new DocumentCache(() =>
    calls++ === 0
      ? Promise.resolve({ rows: [{ id: 1 }, { id: 2 }], total: 2 })
      : stale.promise,
  );
  const path = "/documents/waybill?status=Created";
  await cache.load(path);
  cache.invalidate(path, true);
  const refreshing = cache.load(path);
  await tick();
  cache.update(path, (data) => ({
    rows: data.rows.filter((row) => row.id !== 1),
    total: data.total - 1,
  }));
  assert.deepEqual(cache.get(path).data, { rows: [{ id: 2 }], total: 1 });
  stale.resolve({ rows: [{ id: 1 }, { id: 2 }], total: 2 });
  await refreshing;
  assert.deepEqual(cache.get(path).data, { rows: [{ id: 2 }], total: 1 });
  cache.dispose();
});

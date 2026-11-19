import assert from "node:assert/strict";
import test from "node:test";
import { createTenantApi } from "../src/saasTenantApi.ts";

const ready = { state: "ready", read: true, write: true, reasons: [] };
const endpoint = "/documents/admin/writeoff-reasons";
test("reason create/edit use company origin and current CSRF; conflicts propagate", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/me"))
      return Response.json({ csrf_token: "company-token" });
    if (url.endsWith("/1"))
      return Response.json({ detail: "Причина уже изменена" }, { status: 409 });
    return Response.json({ reason: { id: 1 } });
  });
  const api = createTenantApi("company", "https://company.example");
  await api.me();
  const runtime = api.dashboardRuntime(
    () => {},
    () => {},
    true,
    { "management.users": ready },
  );
  const body = JSON.stringify({ name: "Бой", account_id: "account-1" });
  await runtime.request(endpoint, { method: "POST", body });
  assert.equal(calls[1].url, "https://company.example/api" + endpoint);
  assert.equal(calls[1].init.headers["X-CSRF-Token"], "company-token");
  assert.equal(calls[1].init.body, body);
  await assert.rejects(
    runtime.request(endpoint + "/1", { method: "POST", body }),
    (error) => error.status === 409 && error.message === "Причина уже изменена",
  );
});
test("reason mutations require user administration readiness and never inherit owner setup exception", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("denied mutation reached network"),
  );
  const api = createTenantApi("company");
  for (const historyOnly of [false, true]) {
    const runtime = api.dashboardRuntime(
      () => {},
      () => {},
      true,
      { "management.settings": ready, "documents.writeoffs": ready },
      historyOnly,
      true,
    );
    for (const path of [endpoint, endpoint + "/1"]) {
      await assert.rejects(
        runtime.request(path, { method: "POST", body: "{}" }),
        (error) => error.status === 403,
      );
    }
  }
});

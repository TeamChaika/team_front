import test from "node:test";
import assert from "node:assert/strict";
import {
  isTenantRecoveryPage,
  tenantRecoveryResponse,
} from "../src/tenantRecoveryRequest.ts";
import { resolveSaasEntry } from "../src/saasTenantApi.ts";

test("known company recovery remains reachable during configuration updates", () => {
  const context = {
    surface: "tenant",
    company: { id: "own", slug: "own", name: "Own" },
  };
  for (const page of ["/forgot-password", "/reset-password"]) {
    assert.equal(isTenantRecoveryPage(page), true);
    assert.equal(resolveSaasEntry(context, page).surface, "tenant");
    assert.equal(
      resolveSaasEntry({ ...context, full_dashboard_ready: true }, page)
        .surface,
      "tenant",
    );
  }
  for (const page of [
    "/reset-password/",
    "/reset-password/other",
    "/forgot-password?x=1",
    "/auth/recovery",
  ])
    assert.equal(isTenantRecoveryPage(page), false);
});

test("public recovery transport sends no cookies or redirected passwords and rejects other routes", async () => {
  const calls = [];
  const transport = async (...args) => {
    calls.push(args);
    return new Response("{}");
  };
  await tenantRecoveryResponse(
    "https://own.example",
    "/auth/recovery/telegram",
    {},
    transport,
  );
  await tenantRecoveryResponse(
    "https://own.example",
    "/auth/recovery/reset",
    {
      method: "POST",
      body: '{"token":"synthetic"}',
      credentials: "include",
      redirect: "follow",
    },
    transport,
  );
  assert.equal(
    calls[0][0],
    "https://own.example/api/auth/recovery/telegram",
  );
  for (const [, init] of calls) {
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
  }
  assert.equal(calls[1][1].body, '{"token":"synthetic"}');
  await assert.rejects(
    tenantRecoveryResponse(
      "https://own.example",
      "/auth/recovery/reset",
      {},
      transport,
    ),
  );
  await assert.rejects(
    tenantRecoveryResponse(
      "https://own.example",
      "/auth/recovery/telegram",
      { method: "POST" },
      transport,
    ),
  );
  await assert.rejects(
    tenantRecoveryResponse(
      "https://own.example",
      "/profile/password",
      {},
      transport,
    ),
  );
  assert.equal(calls.length, 2);
});

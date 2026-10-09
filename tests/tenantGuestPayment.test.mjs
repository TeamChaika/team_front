import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGuestDepositRoute,
  safePaymentUrl,
  depositGuestLink,
  guestDepositRequest,
} from "../src/tenantGuestPayment.ts";
import { tenantDateTime, tenantToday } from "../src/tenantPaymentDates.ts";
const id = "12345678-1234-1234-1234-123456789abc";
const token = "a".repeat(32);
test("guest capability route is exact and accepts one strong token", () => {
  assert.deepEqual(
    parseGuestDepositRoute(`/deposit/${id}`, `?token=${token}`),
    { depositId: id, token },
  );
  for (const path of [
    "/deposits",
    `/deposit/${id}/extra`,
    `/deposit/%31${id.slice(1)}`,
  ])
    assert.equal(parseGuestDepositRoute(path, `?token=${token}`), null);
  for (const search of [
    "?token=short",
    `?token=${token}&token=${token}`,
    "?token=" + "a".repeat(513),
  ])
    assert.equal(parseGuestDepositRoute(`/deposit/${id}`, search), null);
});
test("tenant guest links fail closed while primary legacy deposits retain fallback", () => {
  const origin = "https://demo.example.com";
  assert.equal(depositGuestLink(id, null, true, origin), null);
  assert.equal(
    depositGuestLink(id, `https://pay.chaika.team/deposit/${id}`, true, origin),
    null,
  );
  assert.equal(
    depositGuestLink(
      id,
      `${origin}/deposit/${id}?token=${token}`,
      true,
      origin,
    ),
    `${origin}/deposit/${id}?token=${token}`,
  );
  assert.equal(
    depositGuestLink(id, null, false, origin),
    `https://pay.chaika.team/deposit/${id}`,
  );
  for (const unsafe of [
    "javascript:alert(1)",
    "data:image/png;base64,a",
    "http://bank.test/pay",
    "https://user:pass@bank.test/pay",
  ])
    assert.equal(safePaymentUrl(unsafe), null);
});
test("company reservation wall time uses its timezone including DST", () => {
  assert.equal(
    tenantDateTime("2026-10-08", "12:00", "Asia/Vladivostok"),
    "2026-10-08T02:00:00.000Z",
  );
  assert.equal(
    tenantDateTime("2026-07-08", "12:00", "Europe/Berlin"),
    "2026-07-08T10:00:00.000Z",
  );
  assert.throws(() => tenantDateTime("2026-03-29", "02:30", "Europe/Berlin"));
  assert.equal(
    tenantToday("Asia/Vladivostok", new Date("2026-10-08T15:00:00Z")),
    "2026-10-09",
  );
});
test("guest transport omits credentials and retains caller request id on repeated preparation", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(
      JSON.stringify({ id, amount_minor: 100, revision: 1 }),
      { status: 200 },
    );
  };
  try {
    const requestId = "abcdef00-1234-1234-1234-123456789abc";
    await guestDepositRequest(
      "https://api.demo.example.com",
      { depositId: id, token },
      "prepare",
      requestId,
    );
    await guestDepositRequest(
      "https://api.demo.example.com",
      { depositId: id, token },
      "prepare",
      requestId,
    );
    assert.equal(
      calls[0][0],
      `https://api.demo.example.com/api/guest-deposits/${id}/prepare`,
    );
    assert.equal(calls[0][1].credentials, "omit");
    assert.equal(calls[0][1].referrerPolicy, "no-referrer");
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      token,
      request_id: requestId,
    });
    assert.equal(calls[1][1].body, calls[0][1].body);
    await guestDepositRequest("https://api.demo.example.com", {
      depositId: id,
      token,
    });
    assert.equal(calls[2][1].method, "GET");
    assert.equal(calls[2][1].body, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("guest route remains reachable for existing payments during setup changes", async () => {
  const { resolveSaasEntry } = await import("../src/saasTenantApi.ts");
  const context = {
    surface: "tenant",
    company: { id: "a", slug: "company-a", name: "Company A" },
  };
  const path = `/deposit/${id}`;
  assert.equal(
    resolveSaasEntry(context, path, `?token=${token}`).surface,
    "tenant",
  );
  const entry = resolveSaasEntry(
    { ...context, full_dashboard_ready: true },
    path,
    `?token=${token}`,
  );
  assert.equal(entry.fullDashboardReady, true);
  assert.equal(entry.slug, "company-a");
  assert.deepEqual(entry.guestDeposit, { depositId: id, token });
  assert.equal(
    resolveSaasEntry(
      { ...context, full_dashboard_ready: true },
      path,
      "?token=short",
    ).surface,
    "denied",
  );
  assert.equal(
    resolveSaasEntry({ ...context, full_dashboard_ready: true }, "/management")
      .guestDeposit,
    undefined,
  );
});

test("public context loads without session cookies and cannot use another API origin", async () => {
  const { loadSharedTenantEntry } = await import(
    "../src/sharedDashboardEntry.ts"
  );
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(
      JSON.stringify({
        surface: "tenant",
        full_dashboard_ready: true,
        company: { id: "a", slug: "company-a", name: "Company A" },
      }),
      { status: 200 },
    );
  };
  try {
    const entry = await loadSharedTenantEntry(
      "https://demo.example.com",
      "https://api.demo.example.com",
      `/deposit/${id}`,
      `?token=${token}`,
    );
    assert.equal(entry.guestDeposit.token, token);
    assert.equal(calls[0][1].credentials, "omit");
    await assert.rejects(
      loadSharedTenantEntry(
        "https://demo.example.com",
        "https://api.other.example.com",
        `/deposit/${id}`,
        `?token=${token}`,
      ),
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyCompany,
  connectionLoadMatchesCompany,
  connectionCredentialError,
  auditFieldLabel,
  companyCountLabel,
  normalizeCompany,
  validateCompany,
} from "../src/saasAdminModel.ts";
test("new company has no inferred contact, modules or integrations", () => {
  const c = emptyCompany();
  assert.equal(c.primary_admin, null);
  assert.equal(c.chain_url, null);
  assert.deepEqual(c.rms, []);
  assert.equal(Object.values(c.modules).some(Boolean), false);
});
test("normalizes optional blanks without mutating original", () => {
  const c = emptyCompany();
  c.name = "  Компания  ";
  c.slug = " company ";
  c.primary_admin = { name: " ", email: " ", phone: "" };
  c.domain = " ";
  const n = normalizeCompany(c);
  assert.equal(n.name, "Компания");
  assert.equal(n.slug, "company");
  assert.equal(n.domain, null);
  assert.equal(n.primary_admin, null);
  assert.equal(c.name, "  Компания  ");
});
test("validates identity, HTTP endpoints and subscription range", () => {
  const c = emptyCompany();
  c.name = "Компания";
  c.slug = "company";
  c.chain_url = "javascript:alert(1)";
  c.subscription = {
    plan: "test",
    start_date: "2026-10-20",
    end_date: "2026-10-10",
  };
  const errors = validateCompany(c);
  assert.ok(errors.chain_url);
  assert.ok(errors.end_date);
  c.chain_url = "https://chain.example.ru";
  c.subscription.end_date = "2026-10-30";
  assert.deepEqual(validateCompany(c), {});
});

test("full server Company projects only explicit writable fields", () => {
  const source = {
    ...emptyCompany(),
    name: "Компания",
    slug: "company",
    id: "104f71b9-6a64-4f5a-ad00-64d5c379347b",
    version: 8,
    created_at: "2026-10-08T12:00:00Z",
    updated_at: "2026-10-08T12:10:00Z",
    archived_at: null,
    subscription_state: "active",
    integration_state: "not_checked",
    rms: [
      {
        id: "04f71b9a-6a64-4f5a-ad00-64d5c379347b",
        label: "RMS",
        url: "https://rms.example.ru",
        enabled: true,
        server_only: "ignored",
      },
    ],
    modules: { ...emptyCompany().modules, future_server_field: true },
    subscription: {
      plan: "Pro",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      calculated: "ignored",
    },
  };
  const payload = normalizeCompany(source);
  assert.deepEqual(
    Object.keys(payload).sort(),
    Object.keys(emptyCompany()).sort(),
  );
  assert.deepEqual(Object.keys(payload.rms[0]).sort(), [
    "enabled",
    "id",
    "label",
    "url",
  ]);
  assert.deepEqual(
    Object.keys(payload.modules).sort(),
    Object.keys(emptyCompany().modules).sort(),
  );
  assert.deepEqual(Object.keys(payload.subscription).sort(), [
    "end_date",
    "plan",
    "start_date",
  ]);
  assert.equal(source.version, 8);
  assert.equal(payload.subscription.plan, "Pro");
});

test("audit field labels hide server identifiers and plural counts follow Russian forms", () => {
  assert.equal(auditFieldLabel("chain_url"), "Адрес iiko Chain");
  assert.equal(auditFieldLabel("subscription.end_date"), "Подписка");
  assert.equal(auditFieldLabel("future_private_field"), "Другие данные");
  for (const [count, label] of [
    [0, "0 компаний"],
    [1, "1 компания"],
    [2, "2 компании"],
    [11, "11 компаний"],
    [21, "21 компания"],
    [24, "24 компании"],
    [114, "114 компаний"],
  ])
    assert.equal(companyCountLabel(count), label);
});

test("credential payload preserves password spaces, omits blank password and removed connections", () => {
  const value = {
    ...emptyCompany(),
    chain_url: "https://chain.example.ru",
    rms: [
      {
        id: "rms-id",
        label: "RMS",
        url: "https://rms.example.ru",
        enabled: true,
      },
    ],
    connection_credentials: {
      chain: { login: " user ", password: "  exact password  " },
      "rms-id": { login: "rms", password: "" },
      removed: { login: "unused", password: "secret" },
    },
  };
  const payload = normalizeCompany(value);
  assert.deepEqual(payload.connection_credentials, {
    chain: { login: "user", password: "  exact password  " },
    "rms-id": { login: "rms" },
  });
  value.chain_url = null;
  assert.equal(normalizeCompany(value).connection_credentials.chain, undefined);
});
test("stored password can be reused only for same URL and login", () => {
  const stored = {
    id: "chain",
    url: "https://chain.example.ru",
    login: "user",
    password_set: true,
    check: {
      status: "not_checked",
      code: null,
      message: null,
      checked_at: null,
    },
  };
  assert.equal(
    connectionCredentialError(stored.url, { login: "user" }, stored),
    null,
  );
  assert.ok(
    connectionCredentialError(
      "https://other.example.ru",
      { login: "user" },
      stored,
    ),
  );
  assert.ok(
    connectionCredentialError(stored.url, { login: "changed" }, stored),
  );
  assert.ok(connectionCredentialError(stored.url, { login: "user" }));
  assert.equal(
    connectionCredentialError(
      "https://other.example.ru",
      { login: "changed", password: "  pass  " },
      stored,
    ),
    null,
  );
});

test("connection load scope hides data for a different company or version", () => {
  const company = { id: "company-b", version: 2 };
  assert.equal(connectionLoadMatchesCompany(null, company), false);
  assert.equal(
    connectionLoadMatchesCompany(
      { company_id: "company-a", version: 2 },
      company,
    ),
    false,
  );
  assert.equal(
    connectionLoadMatchesCompany(
      { company_id: "company-b", version: 1 },
      company,
    ),
    false,
  );
  assert.equal(
    connectionLoadMatchesCompany(
      { company_id: "company-b", version: 2 },
      company,
    ),
    true,
  );
});

test("lost issuance response recovers committed account and latest company snapshot without writes", async () => {
  const { loadAdminAccessSnapshot } = await import("../src/saasAdminModel.ts");
  const oldCompany = {
    ...emptyCompany(),
    id: "company-a",
    version: 2,
    name: "Old",
    slug: "old",
  };
  const latestCompany = {
    ...oldCompany,
    version: 3,
    name: "Current",
    slug: "current",
  };
  const committedAccess = {
    company_version: 3,
    exists: true,
    login_path: "/tenant/current",
    admin: { username: "person@example.ru", status: "temporary" },
  };
  let reads = 0;
  const result = await loadAdminAccessSnapshot(
    oldCompany,
    async () => {
      reads++;
      return committedAccess;
    },
    async () => latestCompany,
  );
  assert.equal(reads, 1);
  assert.equal(result.company.version, 3);
  assert.equal(result.company.slug, "current");
  assert.equal(result.access.exists, true);
  assert.equal("temporary_password" in result.access, false);
});
test("moving access metadata requires matching snapshot before another owner action", async () => {
  const { loadAdminAccessSnapshot } = await import("../src/saasAdminModel.ts");
  const company = { ...emptyCompany(), id: "company-a", version: 2 };
  let reads = 0;
  const result = await loadAdminAccessSnapshot(
    company,
    async () => ({
      company_version: ++reads === 1 ? 3 : 4,
      exists: true,
      admin: null,
    }),
    async () => ({ ...company, version: 4 }),
  );
  assert.equal(result.access.company_version, result.company.version);
  assert.equal(reads, 2);
  await assert.rejects(
    loadAdminAccessSnapshot(
      company,
      async () => ({ company_version: 8 }),
      async () => ({ ...company, version: 4 }),
    ),
    /Обновите карточку/,
  );
});

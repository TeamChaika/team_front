// Local synthetic fixture for CUA review; never contacts a real API or iiko.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const port = Number(process.env.PORT || 4186);
// DEV localhost uses the primary entry without weakening production host checks.
const vite = await createViteServer({
  configFile: false,
  envFile: false,
  plugins: [react()],
  cacheDir: `/tmp/writeoff-reasons-fixture-vite-${port}`,
  define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/api") },
  server: { middlewareMode: true, hmr: false },
  appType: "spa",
});
const company = {
  id: "66666666-6666-4666-8666-666666666666",
  slug: "test-customer",
  name: "Тестовый ресторан",
};
const user = {
  id: "77777777-7777-4777-8777-777777777777",
  username: "owner@example.test",
  display_name: "Администратор",
  role: "owner",
};
const readiness = Object.fromEntries(
  [
    "management.users",
    "management.settings",
    "documents.writeoffs",
    "profile.account",
  ].map((key) => [
    key,
    { state: "ready", read: true, write: true, reasons: [] },
  ]),
);
let reasons = [
  {
    id: 1,
    name: "Порча",
    account_id: "account-1",
    account_name: "Потери",
    version: 1,
  },
];
const accounts = [
  { id: "account-1", name: "Потери", code: "91.2" },
  { id: "account-2", name: "Питание персонала", code: "26" },
];
const admin = process.env.FIXTURE_ADMIN !== "0";
const fail = Number(process.env.FIXTURE_ERROR || 0);
assert.ok([0, 400, 403, 409].includes(fail));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const json = (body, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (!url.pathname.startsWith("/api/")) {
      return vite.middlewares(req, res, () => json({}, 404));
    }
    switch (url.pathname) {
      case "/api/saas-context":
        return json({
          surface: "tenant",
          company,
          full_dashboard_ready: true,
          full_dashboard_available: true,
          feature_readiness: readiness,
        });
      case "/api/saas-tenant/test-customer/auth/me":
        return json({
          user,
          company,
          actor: {
            kind: "company_member",
            company_id: company.id,
            auth_user_id: user.id,
          },
          csrf_token: "synthetic-csrf",
          must_change_password: false,
        });
      case "/api/saas-tenant/test-customer/workspace":
        return json({
          company: { ...company, modules: { documents: true } },
          admin: user,
          mode: "production",
          business_modules_ready: true,
          full_dashboard_ready: true,
          full_dashboard_available: true,
          feature_readiness: readiness,
        });
      case "/api/me":
        return json({
          user,
          departments: [],
          sales_dates: [],
          balance_dates: [],
          sections: ["management", "profile", "writeoffs"],
          can_manage: admin,
          documents_enabled: true,
          modules: ["iiko"],
          today: "2026-11-13",
          feature_readiness: readiness,
        });
      case "/api/management/accounts":
        return json({
          users: [],
          sections: [],
          departments: [],
          warehouses: [],
          venues: [],
        });
      case "/api/management/venues":
        return json({ venues: [], terminals: [], tenant_payments: true });
      case "/api/assistant/status":
        return json({ enabled: false, available: false });
      case "/api/profile/telegram":
        return json({ available: false, linked: false });
    }
    const match = url.pathname.match(
      /^\/api\/documents\/admin\/writeoff-reasons(?:\/(\d+))?$/,
    );
    if (!match)
      return json({ detail: "Неожиданный запрос тестового стенда" }, 404);
    if (!admin || (fail === 403 && req.method === "GET"))
      return json({ detail: "Недостаточно прав" }, 403);
    if (req.method === "GET") return json({ reasons, accounts });
    if (req.method !== "POST") return json({}, 405);
    // Primary localhost entry has no tenant cookie or CSRF transport. Tenant
    // transport and its CSRF boundary are covered by writeoffReasons.test.mjs.
    let content = "";
    for await (const chunk of req) {
      content += chunk;
      if (content.length > 10000) return json({}, 413);
    }
    const body = JSON.parse(content);
    if (fail)
      return json(
        {
          detail:
            fail === 409
              ? "Причина уже изменена"
              : "Не удалось сохранить причину",
        },
        fail,
      );
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 128 ||
      !accounts.some((account) => account.id === body.account_id)
    )
      return json({ detail: "Проверьте название и счёт" }, 400);
    const previous =
      match[1] && reasons.find((reason) => reason.id === Number(match[1]));
    if (match[1] && !previous) return json({}, 404);
    if (previous && previous.version !== body.version)
      return json({ detail: "Причина уже изменена" }, 409);
    const reason = {
      id: previous
        ? previous.id
        : Math.max(0, ...reasons.map((reason) => reason.id)) + 1,
      name: body.name.trim(),
      account_id: body.account_id,
      account_name: accounts.find((account) => account.id === body.account_id)
        .name,
      version: (previous?.version || 0) + 1,
    };
    reasons = [...reasons.filter((item) => item.id !== reason.id), reason];
    json({ reason });
  } catch {
    json({ detail: "Ошибка тестового стенда" }, 500);
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Synthetic fixture: http://127.0.0.1:${server.address().port}/management`,
  ),
);

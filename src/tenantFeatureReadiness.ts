export type FeatureReadiness = Record<
  string,
  {
    state: "ready" | "blocked" | "not_checked";
    read: boolean;
    write: boolean;
    reasons: string[];
  }
>;

const sectionFeatures: Record<string, string[]> = {
  overview: ["analytics.overview"],
  sales: ["analytics.sales"],
  indicators: ["analytics.indicators"],
  products: ["inventory.catalog"],
  charts: ["inventory.catalog"],
  balances: ["inventory.balances"],
  "purchase-prices": ["purchases.prices", "purchases.impact"],
  "cash-shifts": ["iiko.cash_shifts"],
  events: ["iiko.order_events"],
  transfers: ["documents.waybills"],
  writeoffs: ["documents.writeoffs"],
  invoices: ["commercial.incoming", "iiko.history"],
  outgoing: ["commercial.outgoing", "iiko.history"],
  employees: ["employees.management"],
  deposits: ["deposits.bookings"],
  management: ["management.settings", "management.users"],
  profile: ["profile.account"],
  status: ["operations.sync"],
};
export function tenantFeatureAllowed(
  readiness: FeatureReadiness | undefined,
  feature: string,
  operation: "read" | "write",
) {
  return readiness === undefined || readiness[feature]?.[operation] === true;
}
export function tenantSectionReady(
  readiness: FeatureReadiness | undefined,
  section: string,
) {
  return (
    readiness === undefined ||
    (sectionFeatures[section] ?? []).some((feature) =>
      tenantFeatureAllowed(readiness, feature, "read"),
    )
  );
}
export function tenantSectionWriteReady(
  readiness: FeatureReadiness | undefined,
  section: string,
) {
  return (
    readiness === undefined ||
    (sectionFeatures[section] ?? []).some((feature) =>
      tenantFeatureAllowed(readiness, feature, "write"),
    )
  );
}
// Match the gateway's feature families. Unknown mutations fail closed when the
// server supplies partial readiness; the gateway independently enforces ACLs.
export function tenantRouteFeatures(path: string, method: string): string[] {
  const parts = path.split("?")[0].split("/").slice(1);
  const [family, kind] = parts;
  const simple: Record<string, string> = {
    me: "profile.account",
    overview: "analytics.overview",
    sales: "analytics.sales",
    "discount-details": "analytics.sales",
    indicators: "analytics.indicators",
    "balance-products": "inventory.balances",
    employees: "employees.management",
    topology: "iiko.order_events",
    status: "operations.sync",
    assistant: "assistant.chat",
    profile: "profile.account",
    deposits: "deposits.bookings",
    "payment-settings": "management.settings",
  };
  if (simple[family])
    return family === "profile" && kind?.startsWith("telegram")
      ? [simple[family], "notifications.telegram"]
      : [simple[family]];
  if (family === "purchase-prices")
    return [kind === "impact" ? "purchases.impact" : "purchases.prices"];
  if (family === "management")
    return [kind === "accounts" ? "management.users" : "management.settings"];
  if (family === "resources") {
    const resource: Record<string, string> = {
      products: "inventory.catalog",
      charts: "inventory.catalog",
      balances: "inventory.balances",
      employees: "employees.management",
      "cash-shifts": "iiko.cash_shifts",
      events: "iiko.order_events",
      invoices: "iiko.history",
      outgoing: "iiko.history",
      transfers: "iiko.history",
      writeoffs: "iiko.history",
    };
    return resource[kind] ? [resource[kind]] : [];
  }
  if (family === "documents") {
    if (kind === "admin") return ["management.users"];
    const feature = ["waybills", "waybill", "transfers"].includes(kind)
      ? "documents.waybills"
      : ["writeoffs", "writeoff"].includes(kind)
        ? "documents.writeoffs"
        : undefined;
    if (!feature) return [];
    const action = parts.at(-1);
    const features = [feature];
    if (
      [
        "approve",
        "accept",
        "reject",
        "confirm",
        "deny",
        "receive",
        "confirm_receipt",
        "reject_receipt",
      ].includes(action ?? "")
    )
      features.push("documents.approval");
    if (
      ["send", "retry", "confirm", "confirm_receipt", "receive"].includes(
        action ?? "",
      )
    )
      features.push("documents.dispatch");
    return features;
  }
  if (family === "commercial-invoices") {
    const feature = ["incoming", "purchase", "receipt"].includes(kind)
      ? "commercial.incoming"
      : ["sale", "outgoing", "existing-outgoing"].includes(kind)
        ? "commercial.outgoing"
        : kind === "admin"
          ? "management.users"
          : undefined;
    if (!feature) return [];
    return [
      feature,
      ...(parts.at(-1) === "pdf"
        ? ["commercial.invoice_pdf"]
        : parts.includes("counterparties") && method === "POST"
          ? ["commercial.counterparties"]
          : []),
    ];
  }
  return [];
}
export function tenantHistoryRequest(path: string, method: string) {
  const pathname = path.split("?")[0];
  return (
    ["GET", "HEAD"].includes(method) ||
    (method === "POST" &&
      (pathname === "/discount-details" ||
        /^\/indicators\/(query|metric\/[^/]+|options\/[^/]+)$/.test(pathname)))
  );
}
export function tenantOwnerSetupMutation(path: string, method: string) {
  if (method !== "POST") return false;
  const pathname = path.split("?")[0];
  if (pathname === "/profile/password") return true;
  const uuid =
    "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  return (
    new RegExp(
      `^/(?:payment-settings|management)/venues/${uuid}(?:/terminals/${uuid})?$`,
    ).test(pathname) ||
    new RegExp(
      `^/payment-settings/venues/${uuid}/terminals/${uuid}/validate$`,
    ).test(pathname)
  );
}
export function tenantMutationReady(
  readiness: FeatureReadiness | undefined,
  path: string,
  method: string,
) {
  if (readiness === undefined || ["GET", "HEAD"].includes(method)) return true;
  const operation = tenantHistoryRequest(path, method) ? "read" : "write";
  const features = tenantRouteFeatures(path, method);
  return (
    features.length > 0 &&
    features.every((feature) =>
      tenantFeatureAllowed(readiness, feature, operation),
    )
  );
}

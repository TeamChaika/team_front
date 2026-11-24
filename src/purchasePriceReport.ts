export type PreparedImpactPeriod = {
  status: "ready" | "pending";
  prepared_at?: string | null;
  end?: string;
  target_end?: string;
  coverage?: { complete: boolean };
};

export function canReadPurchaseImpact(warehouseMode?: "all" | "selected") {
  return warehouseMode !== "selected";
}

const filterDefaults = {
  kind: "unlinked",
  exclude_household: true,
  recent_only: true,
  product: null as string | null,
  direction: "all",
  threshold: "0",
  sort: "date",
  page: 1,
};
export type PurchasePriceFilters = typeof filterDefaults;

export function purchasePriceFilters(
  params: URLSearchParams,
): PurchasePriceFilters {
  function option(
    key: "kind" | "direction" | "threshold" | "sort",
    values: string[],
  ) {
    const value = params.get(key);
    return value && values.includes(value) ? value : filterDefaults[key];
  }
  const page = Number(params.get("page"));
  return {
    kind: option("kind", ["all", "unlinked", "linked"]),
    exclude_household: params.get("exclude_household") !== "false",
    recent_only: params.get("recent_only") !== "false",
    product: params.get("product") || null,
    direction: option("direction", [
      "all",
      "rise",
      "fall",
      "unchanged",
      "no_history",
    ]),
    threshold: option("threshold", ["0", "1", "5", "10"]),
    sort: option("sort", [
      "date",
      "date_asc",
      "percent",
      "percent_asc",
      "percent_desc",
      "weekly_asc",
      "weekly_desc",
    ]),
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
  };
}

export function updatePurchasePriceFilters(
  params: URLSearchParams,
  changes: Partial<PurchasePriceFilters>,
) {
  const next = new URLSearchParams(params);
  const updated = { page: 1, ...changes };
  for (const key of Object.keys(updated) as (keyof PurchasePriceFilters)[]) {
    const value = updated[key];
    if (value == null || value === filterDefaults[key]) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export function purchasePriceReportPath(
  scope: string,
  kind: string,
  excludeHousehold: boolean,
  recentOnly: boolean,
  includeImpact: boolean,
) {
  const params = new URLSearchParams(scope);
  params.set("kind", kind);
  params.set("exclude_household", String(excludeHousehold));
  params.set("recent_only", String(recentOnly));
  if (recentOnly) params.set("recent_period", "month");
  else params.delete("recent_period");
  params.delete("include_impact");
  if (includeImpact) params.set("include_impact", "true");
  return "/purchase-prices?" + params.toString();
}

export function purchaseImpactNotice(
  allowed: boolean,
  period?: PreparedImpactPeriod,
) {
  return allowed && period?.status !== "ready" ? "Расчёт обновляется" : null;
}

export function waitingForPurchaseImpact(period?: PreparedImpactPeriod) {
  return (
    !period ||
    period.status === "pending" ||
    period.coverage?.complete === false ||
    Boolean(period.target_end && period.end && period.end < period.target_end)
  );
}

export type PreparedImpactPeriod = {
  status: "ready" | "pending";
  prepared_at?: string | null;
};

export function canReadPurchaseImpact(warehouseMode?: "all" | "selected") {
  return warehouseMode !== "selected";
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

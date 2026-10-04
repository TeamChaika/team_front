import type { WriteoffCostEstimate } from "./documentModel";

const rubles = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function writeoffMoney(value: string | number | null | undefined) {
  if (value == null || value === "" || !Number.isFinite(Number(value)))
    return "—";
  if (Number(value) > 0 && Number(value) < 0.1) return "< 0,1 ₽";
  return `${rubles.format(Number(value))} ₽`;
}

export function writeoffCostSummary(
  estimate: WriteoffCostEstimate | null | undefined,
) {
  const complete =
    !!estimate && estimate.total != null && estimate.unpriced_count === 0;
  return {
    complete,
    total: complete ? writeoffMoney(estimate.total) : "Нет полного расчёта",
    known: estimate ? writeoffMoney(estimate.known_total) : "—",
    missing: estimate?.unpriced_count ?? 0,
  };
}

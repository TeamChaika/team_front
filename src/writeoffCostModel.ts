import type { DocumentRecord, WriteoffCostEstimate } from "./documentModel";
import type { CachedResource } from "./documentCache";

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
  const hasKnown =
    !!estimate &&
    (complete ||
      (writeoffMoney(estimate.known_total) !== "—" &&
        (Number(estimate.known_total) !== 0 ||
          estimate.items?.some((item) => item.sum != null))));
  return {
    complete,
    total: complete ? writeoffMoney(estimate.total) : "Нет полного расчёта",
    known: estimate ? writeoffMoney(estimate.known_total) : "—",
    missing: estimate?.unpriced_count ?? 0,
    hasKnown,
    label: complete ? "Сумма" : hasKnown ? "Рассчитано" : "Сумма списания",
    amount: hasKnown
      ? writeoffMoney(complete ? estimate.total : estimate.known_total)
      : "Нет данных",
  };
}

export function writeoffListCostText(
  estimate: WriteoffCostEstimate | null | undefined,
) {
  if (!estimate) return "Сумма: нет данных";
  const result = writeoffCostSummary(estimate);
  return result.complete
    ? `Сумма: ${result.amount}`
    : `${result.hasKnown ? `Рассчитано: ${result.amount}` : "Сумма: нет данных"} · без расчёта: ${result.missing} поз.`;
}

// A refreshed pending quote belongs only to the document revision it priced.
export function writeoffListEstimate(
  row: DocumentRecord,
  snapshot: CachedResource<DocumentRecord>,
  now = Date.now(),
) {
  const detail = snapshot.data;
  if (
    !detail ||
    snapshot.error ||
    snapshot.expiresAt <= now ||
    detail.id !== row.id ||
    detail.kind !== row.kind ||
    detail.version !== row.version ||
    detail.status !== row.status ||
    detail.submission_state !== row.submission_state ||
    detail.receipt_state !== row.receipt_state ||
    !detail.cost_estimate
  )
    return row.cost_estimate;
  const listedAt = Date.parse(row.cost_estimate?.estimated_at || "");
  const detailedAt = Date.parse(detail.cost_estimate.estimated_at);
  if (
    Number.isFinite(listedAt) &&
    (!Number.isFinite(detailedAt) || detailedAt < listedAt)
  )
    return row.cost_estimate;
  return detail.cost_estimate;
}

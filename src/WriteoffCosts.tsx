import { Group, Text } from "@mantine/core";
import { dateText } from "./api";
import type { WriteoffCostEstimate } from "./documentModel";
import { writeoffCostSummary } from "./writeoffCostModel";

export function WriteoffCostSummary({
  estimate,
}: {
  estimate?: WriteoffCostEstimate | null;
}) {
  const result = writeoffCostSummary(estimate);
  return (
    <div className="writeoff-cost-summary">
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>
          Сумма списания · оценка
        </Text>
        <Text fw={700} className="writeoff-money">
          {estimate ? result.total : "Нет данных"}
        </Text>
      </Group>
      {estimate && !result.complete && (
        <Text size="xs" c="dimmed">
          Известная сумма: {result.known} · без расчёта: {result.missing} поз.
        </Text>
      )}
      {estimate?.source_at && (
        <Text size="xs" c="dimmed">
          По себестоимости остатков на {dateText(estimate.source_at)}. Итог iiko
          может отличаться.
        </Text>
      )}
    </div>
  );
}

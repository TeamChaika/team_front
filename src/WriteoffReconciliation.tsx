import { Badge, Group, Stack, Table, Text } from "@mantine/core";
import { dateText } from "./api";
import {
  reconciledQuantity,
  writeoffReconciliationLabel,
  type DocumentRecord,
} from "./documentModel";

export function WriteoffReconciliation({
  doc,
  compact = false,
}: {
  doc: DocumentRecord;
  compact?: boolean;
}) {
  const label = writeoffReconciliationLabel(doc);
  if (!label) return null;
  const result = doc.iiko_reconciliation;
  const matched = result?.state === "matched";
  const changed =
    matched && (result.date_differs || result.quantity_difference_count > 0);
  const color = !result
    ? "gray"
    : !matched
      ? "orange"
      : result.iiko_status === "DELETED"
        ? "red"
        : result.iiko_status === "PROCESSED"
          ? "teal"
          : "blue";

  if (compact) {
    return (
      <Group gap="xs" mt={4}>
        <Text size="sm">iiko · {label}</Text>
        {changed && (
          <Text size="sm" c="orange">
            {[
              result.date_differs && "Дата отличается",
              result.quantity_difference_count > 0 &&
                `Расхождения по товарам: ${result.quantity_difference_count}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
      </Group>
    );
  }

  return (
    <Stack
      gap="xs"
      className="writeoff-reconciliation"
      component="section"
      aria-label="Сверка с iiko"
    >
      <Group justify="space-between">
        <Text fw={600}>Сверка с iiko</Text>
        <Badge color={color}>{label}</Badge>
      </Group>
      {matched && (
        <>
          {result.date_differs ? (
            <Text size="sm" c="orange">
              Дата создания · {dateText(result.expected_date)}
              <br />
              Дата в iiko · {dateText(result.actual_date)}
            </Text>
          ) : (
            <Text size="sm">Дата в iiko · {dateText(result.actual_date)}</Text>
          )}
          {result.quantity_difference_count > 0 ? (
            <>
              <Text size="sm" fw={600}>
                Расхождения по товарам · {result.quantity_difference_count}
              </Text>
              <Table.ScrollContainer minWidth={270}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Товар</Table.Th>
                      <Table.Th ta="right">В заявке</Table.Th>
                      <Table.Th ta="right">В iiko</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.quantity_differences?.map((item) => (
                      <Table.Tr key={item.product_id}>
                        <Table.Td>{item.name || item.product_id}</Table.Td>
                        <Table.Td ta="right">
                          {reconciledQuantity(item.expected_amount)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {reconciledQuantity(item.actual_amount)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          ) : (
            <Text size="sm">Товары и количества совпадают</Text>
          )}
        </>
      )}
      {result?.checked_at && (
        <Text size="xs" c="dimmed">
          Проверено {dateText(result.checked_at)}
        </Text>
      )}
    </Stack>
  );
}

import { Alert, Button, Loader, Text } from "@mantine/core";
import { dateText, money } from "./api";
import { useData } from "./useData";
import type { AllocationGroup } from "./profitLossModel";

export const methodOptions = [
  { value: "pending", label: "Распределить позже" },
  { value: "equal", label: "Поровну" },
  { value: "weights", label: "По весам или долям" },
  { value: "revenue", label: "По выручке за полный месяц" },
];
type HistorySnapshot = Pick<AllocationGroup, "amount" | "method" | "parts">;
type HistoryItem = {
  revision: number;
  action: string;
  actor: string;
  changed_at: string;
  before: HistorySnapshot | null;
  after: HistorySnapshot;
};
export function AllocationHistory({
  id,
  names,
}: {
  id: string;
  names: Map<string, string>;
}) {
  const { data, loading, error, reload } = useData<{ rows: HistoryItem[] }>(
    "/profit-loss/allocations/" + id + "/history",
  );
  return (
    <div className="pl-allocation-history">
      {loading && (
        <Loader size="sm" aria-label="Загрузка истории распределения" />
      )}
      {error && (
        <Alert color="red" role="alert">
          {error}{" "}
          <Button variant="subtle" size="xs" onClick={reload}>
            Повторить
          </Button>
        </Alert>
      )}
      {data?.rows.map((item) => (
        <section className="pl-change" key={item.revision}>
          <h3>
            {item.action === "create"
              ? "Счёт создан"
              : item.action === "cancel"
                ? "Счёт аннулирован"
                : "Счёт изменён"}
          </h3>
          <Text size="sm" c="dimmed">
            {dateText(item.changed_at)} · {item.actor}
          </Text>
          <p>
            {item.before && item.before.method !== item.after.method
              ? `${methodOptions.find((option) => option.value === item.before!.method)?.label ?? item.before.method} → `
              : ""}
            {methodOptions.find((option) => option.value === item.after.method)
              ?.label ?? item.after.method}{" "}
            · {money(item.after.amount)} ₽
          </p>
          <dl>
            {item.after.parts.map((part) => (
              <div key={part.department_id}>
                <dt>
                  {names.get(part.department_id) ??
                    part.department ??
                    part.department_id}
                </dt>
                <dd>
                  {part.amount == null
                    ? "Ожидает распределения"
                    : money(part.amount) + " ₽"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

import { Alert, Button, Loader, Text } from "@mantine/core";
import { dateText, money } from "./api";
import { useData } from "./useData";
import { expenseCategoryName, type AllocationGroup } from "./profitLossModel";

export const methodLabels = {
  equal: "Поровну",
  percent: "В процентах",
  amount: "Произвольными суммами",
  pending: "Распределить позже",
  weights: "По весам или долям",
  revenue: "По выручке за полный месяц",
} satisfies Record<AllocationGroup["method"], string>;
type HistorySnapshot = Pick<
  AllocationGroup,
  "amount" | "method" | "parts" | "category" | "category_name"
>;
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
            {item.after.category && (
              <>
                {item.before &&
                  item.before.category !== item.after.category && (
                    <>{expenseCategoryName(item.before)} → </>
                  )}
                {expenseCategoryName(item.after)} ·{" "}
              </>
            )}
            {item.before && item.before.method !== item.after.method
              ? `${methodLabels[item.before.method]} → `
              : ""}
            {methodLabels[item.after.method]} · {money(item.after.amount)} ₽
          </p>
          <dl>
            {item.after.parts.map((part) => (
              <div key={part.department_id}>
                <dt>
                  {names.get(part.department_id) ??
                    part.department ??
                    part.department_id}
                  {part.approver_name && (
                    <small>Кто согласовал · {part.approver_name}</small>
                  )}
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

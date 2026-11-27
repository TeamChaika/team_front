import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { api, ApiError, dateText, money } from "./api";
import {
  expenseCategoryName,
  paymentMethods,
  type Expense,
} from "./profitLossModel";
import { useData } from "./useData";

type Snapshot = Pick<
  Expense,
  | "category"
  | "amount"
  | "expense_date"
  | "paid_date"
  | "comment"
  | "approver_name"
  | "payment_method"
  | "cancelled"
> & { category_name?: string | null };
type History = {
  revision: number;
  action: "create" | "update" | "cancel" | "convert";
  actor: string;
  changed_at: string;
  before: Snapshot | null;
  after: Snapshot;
};
const labels = {
  category: "Статья",
  amount: "Сумма",
  expense_date: "Дата расхода",
  paid_date: "Дата оплаты",
  comment: "Комментарий",
  approver_name: "Кто согласовал",
  payment_method: "Способ оплаты",
  cancelled: "Статус",
};
const historyActions = {
  create: "Расход создан",
  update: "Расход изменён",
  cancel: "Расход аннулирован",
  convert: "Расход передан в распределение",
};
function format(field: keyof typeof labels, snapshot: Snapshot) {
  switch (field) {
    case "category":
      return expenseCategoryName(snapshot);
    case "amount":
      return money(snapshot.amount) + " ₽";
    case "expense_date":
      return dateText(snapshot.expense_date);
    case "paid_date":
      return dateText(snapshot.paid_date);
    case "payment_method":
      return paymentMethods[snapshot.payment_method];
    case "cancelled":
      return snapshot.cancelled ? "Аннулирован" : "Учтён";
    case "comment":
      return snapshot.comment || "—";
    case "approver_name":
      return snapshot.approver_name || "Не указан";
  }
}
export function ExpenseHistory({
  row,
  onClose,
}: {
  row: Expense;
  onClose: () => void;
}) {
  const history = useData<{ rows: History[] }>(
    "/profit-loss/expenses/" + row.id + "/history",
  );
  return (
    <Modal opened centered onClose={onClose} title="История расхода" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {row.department} · {expenseCategoryName(row)} · {money(row.amount)} ₽
        </Text>
        {history.loading && <Loader size="sm" />}
        {history.error && (
          <Alert role="alert" color="red">
            {history.error}
          </Alert>
        )}
        {history.data?.rows.map((item) => (
          <section className="pl-change" key={item.revision}>
            <h3>{historyActions[item.action]}</h3>
            <Text size="sm" c="dimmed">
              {dateText(item.changed_at)} · {item.actor}
            </Text>
            <dl>
              {(Object.keys(labels) as (keyof typeof labels)[])
                .filter((field) =>
                  item.before
                    ? item.before[field] !== item.after[field]
                    : !["cancelled"].includes(field) &&
                      item.after[field] != null,
                )
                .map((field) => (
                  <div key={field}>
                    <dt>{labels[field]}</dt>
                    <dd>
                      {item.before && (
                        <>
                          <span className="muted">
                            {format(field, item.before)}
                          </span>{" "}
                          →{" "}
                        </>
                      )}
                      {field === "cancelled" && item.action === "convert"
                        ? "Передан в распределение"
                        : format(field, item.after)}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </Stack>
    </Modal>
  );
}
export function CancelExpense({
  row,
  onClose,
  onSaved,
  onConflict,
}: {
  row: Expense;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const sending = useRef(false);
  async function cancel() {
    if (sending.current || conflict) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/profit-loss/expenses/" + row.id + "/cancel", {
        method: "POST",
        body: JSON.stringify({ revision: row.revision }),
      });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Не удалось подтвердить аннулирование. Обновите журнал.",
      );
      if (e instanceof ApiError && [403, 404, 409].includes(e.status)) {
        setConflict(true);
        onConflict();
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      opened
      centered
      title="Аннулировать расход?"
      onClose={onClose}
      withCloseButton={!busy}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
    >
      <Stack>
        <Text>
          {expenseCategoryName(row)} · {money(row.amount)} ₽<br />
          {row.department} · {dateText(row.expense_date)}
        </Text>
        <Text size="sm" c="dimmed">
          Сумма будет исключена из отчёта. Запись останется в истории.
        </Text>
        {error && (
          <Alert role="alert" color="red">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Вернуться
          </Button>
          <Button
            color="red"
            onClick={cancel}
            loading={busy}
            disabled={conflict}
          >
            Аннулировать
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

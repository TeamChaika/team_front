import { useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { api, ApiError } from "./api";
import {
  amountForApi,
  categories,
  paymentMethods,
  type Expense,
} from "./profitLossModel";
import type { Venue } from "./venueArchiveModel";

type Props = {
  row: Expense | null;
  venues: Venue[];
  selectedVenue: string;
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
};

export default function ExpenseEditor({
  row,
  venues,
  selectedVenue,
  today,
  onClose,
  onSaved,
  onConflict,
}: Props) {
  const [draft, setDraft] = useState(() => ({
    department_id: row?.department_id ?? selectedVenue,
    expense_date: row?.expense_date ?? today,
    paid_date: row?.paid_date ?? "",
    amount: row?.amount.replace(".", ",") ?? "",
    category: row?.category ?? "",
    payment_method: row?.payment_method ?? "",
    comment: row?.comment ?? "",
  }));
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const sending = useRef(false);
  const change = (name: keyof typeof draft, value: string | null) =>
    setDraft((current) => ({ ...current, [name]: value ?? "" }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || conflict) return;
    const amount = amountForApi(draft.amount);
    if (!amount) {
      setError("Введите положительную сумму с точностью до копейки.");
      return;
    }
    if (
      !draft.department_id ||
      !draft.expense_date ||
      !draft.category ||
      !draft.payment_method
    ) {
      setError("Выберите заведение, дату расхода, статью и способ оплаты.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    const values = {
      expense_date: draft.expense_date,
      paid_date: draft.paid_date || null,
      category: draft.category,
      payment_method: draft.payment_method,
      amount,
      comment: draft.comment.trim(),
    };
    try {
      await api(
        row ? "/profit-loss/expenses/" + row.id : "/profit-loss/expenses",
        {
          method: row ? "PATCH" : "POST",
          body: JSON.stringify(
            row
              ? { ...values, revision: row.revision }
              : {
                  ...values,
                  department_id: draft.department_id,
                  request_id: requestId,
                },
          ),
        },
      );
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Сохранение не подтверждено. Повторите запрос в этой форме.",
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
      title={row ? "Изменить расход" : "Добавить расход"}
      onClose={onClose}
      withCloseButton={!busy}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      size="lg"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          {row ? (
            <TextInput label="Заведение" value={row.department} readOnly />
          ) : (
            <Select
              label="Заведение"
              required
              searchable
              placeholder="Выберите заведение"
              data={venues.map((v) => ({ value: v.id, label: v.name }))}
              value={draft.department_id || null}
              onChange={(v) => change("department_id", v)}
            />
          )}
          <div className="pl-fields">
            <Select
              label="Статья расхода"
              required
              placeholder="Выберите статью"
              data={Object.entries(categories).map(([value, label]) => ({
                value,
                label,
              }))}
              value={draft.category || null}
              onChange={(v) => change("category", v)}
            />
            <TextInput
              label="Сумма, ₽"
              inputMode="decimal"
              required
              autoComplete="off"
              placeholder="0,00"
              value={draft.amount}
              onChange={(e) => change("amount", e.currentTarget.value)}
            />
            <TextInput
              type="date"
              label="Дата расхода"
              required
              description="Определяет период отчёта"
              value={draft.expense_date}
              onChange={(e) => change("expense_date", e.currentTarget.value)}
            />
            <TextInput
              type="date"
              label="Дата оплаты"
              max={today}
              description="Заполните, когда расход оплачен"
              value={draft.paid_date}
              onChange={(e) => change("paid_date", e.currentTarget.value)}
            />
          </div>
          <Select
            label="Способ оплаты"
            required
            placeholder="Выберите способ"
            data={Object.entries(paymentMethods).map(([value, label]) => ({
              value,
              label,
            }))}
            value={draft.payment_method || null}
            onChange={(v) => change("payment_method", v)}
          />
          <Textarea
            label="Комментарий"
            autosize
            minRows={2}
            maxRows={5}
            maxLength={500}
            placeholder="За что или кому заплатили"
            value={draft.comment}
            onChange={(e) => change("comment", e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={busy}>
              Закрыть
            </Button>
            <Button type="submit" loading={busy} disabled={conflict}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

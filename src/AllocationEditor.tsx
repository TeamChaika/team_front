import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NativeSelect,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError, dateText, money } from "./api";
import ExpenseFields, { type ExpenseDraft } from "./ExpenseFields";
import { useData } from "./useData";
import {
  allocationInput,
  canManageAllocation,
  previewMatches,
  type AllocationGroup,
  type AllocationMethod,
  type AllocationPart,
  type AllocationPreview,
  type Expense,
  type FinanceAccess,
} from "./profitLossModel";
import type { Venue } from "./venueArchiveModel";

type Props = {
  allocationId?: string;
  row?: Expense;
  access: FinanceAccess;
  venues: Venue[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
};
const methodOptions = [
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
function AllocationHistory({
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
function initialDraft(
  group: AllocationGroup | null,
  today: string,
): ExpenseDraft {
  return {
    expense_date: group?.expense_date ?? today,
    paid_date: group?.paid_date ?? "",
    amount: group?.amount.replace(".", ",") ?? "",
    category: group?.category ?? "",
    payment_method: group?.payment_method ?? "",
    comment: group?.comment ?? "",
  };
}

export default function AllocationEditor({
  allocationId,
  row,
  access,
  venues,
  today,
  onClose,
  onSaved,
  onConflict,
}: Props) {
  const [group, setGroup] = useState<AllocationGroup | null>(null);
  const [loading, setLoading] = useState(!!allocationId);
  const [draft, setDraft] = useState<ExpenseDraft>(() =>
    initialDraft(null, today),
  );
  const [method, setMethod] = useState<AllocationMethod>("equal");
  const [parts, setParts] = useState<AllocationPart[]>(() =>
    venues.map((venue) => ({ department_id: venue.id })),
  );
  const [preview, setPreview] = useState<{
    key: string;
    value: AllocationPreview;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const sending = useRef(false);
  const submittedPayload = useRef<string | null>(null);
  const previewSequence = useRef(0);
  const input = allocationInput(
    draft.amount,
    draft.expense_date,
    method,
    parts,
  );
  const key = input ? JSON.stringify(input) : "";
  const latestKey = useRef(key);
  latestKey.current = key;
  const readyPreview =
    !!input && preview?.key === key && previewMatches(input, preview.value);
  const canWrite =
    access !== "manager" &&
    (!allocationId || (!!group && canManageAllocation(access, group)));
  const canModify = canWrite && !uncertain;
  useEffect(() => {
    if (!allocationId) return;
    let active = true;
    api<AllocationGroup>("/profit-loss/allocations/" + allocationId)
      .then((result) => {
        if (!active) return;
        setGroup(result);
        setDraft(initialDraft(result, today));
        setMethod(result.method);
        setParts(
          result.parts.map(({ department_id, weight }) => ({
            department_id,
            weight: weight ?? undefined,
          })),
        );
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof ApiError
              ? e.message
              : "Не удалось открыть распределение.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allocationId, today]);
  const change = (name: keyof ExpenseDraft, value: string | null) =>
    setDraft((current) => ({ ...current, [name]: value ?? "" }));
  const toggle = (id: string, checked: boolean) =>
    setParts((current) =>
      checked
        ? [...current, { department_id: id, weight: "" }]
        : current.filter((part) => part.department_id !== id),
    );
  const weight = (id: string, value: string) =>
    setParts((current) =>
      current.map((part) =>
        part.department_id === id ? { ...part, weight: value } : part,
      ),
    );
  async function calculate() {
    if (!input || busy || uncertain || method === "pending") {
      setError(
        "Введите сумму, дату и выберите хотя бы два заведения. Для долей укажите положительный вес каждого.",
      );
      return;
    }
    const sequence = ++previewSequence.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<AllocationPreview>(
        "/profit-loss/allocations/preview",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      if (sequence !== previewSequence.current || key !== latestKey.current)
        return;
      if (!previewMatches(input, result))
        throw new Error("Сервер вернул неполный расчёт. Повторите попытку.");
      setPreview({ key, value: result });
    } catch (e) {
      if (sequence !== previewSequence.current || key !== latestKey.current)
        return;
      setPreview(null);
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Расчёт не получен.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || busy || conflict || !canWrite) return;
    if (!input || (method !== "pending" && !readyPreview)) {
      setError(
        "Сначала рассчитайте актуальное распределение и проверьте суммы.",
      );
      return;
    }
    if (!draft.category || !draft.payment_method) {
      setError("Выберите статью расхода и способ оплаты.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    const payload =
      submittedPayload.current ??
      JSON.stringify({
        ...input,
        parts:
          method === "pending"
            ? input.parts
            : input.parts.map((part) => ({
                ...part,
                amount: preview!.value.parts.find(
                  (item) => item.department_id === part.department_id,
                )!.amount,
              })),
        paid_date: draft.paid_date || null,
        category: draft.category,
        payment_method: draft.payment_method,
        comment: draft.comment.trim(),
        ...(allocationId
          ? { revision: group!.revision }
          : { request_id: requestId.current }),
      });
    submittedPayload.current = payload;
    try {
      await api(
        allocationId
          ? "/profit-loss/allocations/" + allocationId
          : "/profit-loss/allocations",
        {
          method: allocationId ? "PATCH" : "POST",
          body: payload,
        },
      );
      onSaved();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) setUncertain(true);
      else {
        setUncertain(false);
        submittedPayload.current = null;
        if (!allocationId) requestId.current = crypto.randomUUID();
      }
      setError(
        e instanceof ApiError
          ? e.message
          : "Сохранение не подтверждено. Повторите запрос в этой форме без изменения данных.",
      );
      if (e instanceof ApiError && e.status === 409) {
        if (e.message.includes("Распределение изменилось")) {
          setPreview(null);
          setError(
            "Суммы долей изменились. Нажмите «Рассчитать доли» ещё раз.",
          );
        } else {
          setConflict(true);
          setError(
            "Запись изменилась. Закройте форму и откройте её снова, чтобы загрузить текущую версию.",
          );
          onConflict();
        }
      }
      if (e instanceof ApiError && [403, 404].includes(e.status)) {
        setConflict(true);
        onConflict();
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    if (!group || !canWrite || sending.current || conflict) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/profit-loss/allocations/" + allocationId + "/cancel", {
        method: "POST",
        body: JSON.stringify({ revision: group.revision }),
      });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Аннулирование не подтверждено. Обновите журнал.",
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
  const names = new Map(venues.map((venue) => [venue.id, venue.name]));
  for (const part of group?.parts ?? [])
    if (part.department) names.set(part.department_id, part.department);
  const availableVenues = [...venues];
  for (const part of group?.parts ?? [])
    if (!availableVenues.some((venue) => venue.id === part.department_id))
      availableVenues.push({
        id: part.department_id,
        name: names.get(part.department_id) ?? part.department_id,
        archived: true,
      });
  return (
    <Modal
      opened
      centered
      size="lg"
      title={allocationId ? "Распределённый расход" : "Распределить расход"}
      onClose={onClose}
      withCloseButton={!busy}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
    >
      {loading ? (
        <Loader aria-label="Загрузка распределения" size="sm" />
      ) : (
        <form onSubmit={submit}>
          <Stack gap="md">
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            {row && (
              <Text size="sm" c="dimmed">
                Доля {row.department}: {money(row.amount)} ₽. Изменения
                применятся ко всему расходу.
              </Text>
            )}
            <ExpenseFields
              draft={draft}
              today={today}
              change={change}
              disabled={!canModify || busy}
            />
            <NativeSelect
              label="Способ распределения"
              data={methodOptions}
              value={method}
              onChange={(event) =>
                setMethod(event.currentTarget.value as AllocationMethod)
              }
              disabled={!canModify || busy}
            />
            <fieldset className="pl-allocation-venues">
              <legend>Заведения для распределения</legend>
              <div>
                {availableVenues.map((venue) => {
                  const part = parts.find(
                    (item) => item.department_id === venue.id,
                  );
                  return (
                    <div key={venue.id} className="pl-allocation-venue">
                      <Checkbox
                        label={venue.name}
                        checked={!!part}
                        onChange={(e) =>
                          toggle(venue.id, e.currentTarget.checked)
                        }
                        disabled={
                          !canModify || busy || (venue.archived && !part)
                        }
                      />
                      {part && method === "weights" && (
                        <TextInput
                          label={`Вес: ${venue.name}`}
                          inputMode="decimal"
                          value={part.weight ?? ""}
                          placeholder="Например, площадь, кассы, % или сумма"
                          onChange={(e) =>
                            weight(venue.id, e.currentTarget.value)
                          }
                          disabled={!canModify || busy}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {method === "weights" && (
              <Text size="sm" c="dimmed">
                Вес может означать площадь, число касс, процент или
                согласованную сумму. Доли считаются пропорционально весам.
              </Text>
            )}
            {method === "revenue" && (
              <Text size="sm" c="dimmed">
                Выручка берётся за полный календарный месяц даты расхода. Если
                данных недостаточно, выберите ручные доли или сохраните счёт с
                вариантом «Распределить позже».
              </Text>
            )}
            {group && (
              <section
                aria-label="Сохранённые доли"
                className="pl-allocation-preview"
              >
                <strong>Общая сумма: {money(group.amount)} ₽</strong>
                <dl>
                  {group.parts.map((part) => (
                    <div key={part.department_id}>
                      <dt>
                        {names.get(part.department_id) ?? part.department_id}
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
            )}
            {allocationId && (
              <details
                className="pl-allocation-history-toggle"
                onToggle={(event) => {
                  if (event.currentTarget.open) setShowHistory(true);
                }}
              >
                <summary>История</summary>
                {showHistory && (
                  <AllocationHistory id={allocationId} names={names} />
                )}
              </details>
            )}
            {canModify && method !== "pending" && (
              <Button
                type="button"
                variant="light"
                onClick={calculate}
                loading={busy}
              >
                Рассчитать доли
              </Button>
            )}
            {readyPreview && (
              <section
                aria-label="Предпросмотр распределения"
                className="pl-allocation-preview"
              >
                <strong>Доли: {money(input!.amount)} ₽</strong>
                <dl>
                  {preview!.value.parts.map((part) => (
                    <div key={part.department_id}>
                      <dt>
                        {names.get(part.department_id) ?? part.department_id}
                      </dt>
                      <dd>{money(part.amount)} ₽</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {!canWrite && group && (
              <Text size="sm" c="dimmed">
                Изменение всей группы недоступно для вашего доступа.
              </Text>
            )}
            {uncertain && (
              <Text size="sm" c="dimmed">
                Результат сохранения неизвестен. Повтор использует тот же запрос
                и те же данные.
              </Text>
            )}
            {confirmCancel && (
              <Alert color="red">
                Все доли будут исключены из отчёта. Запись останется в истории.
              </Alert>
            )}
            <Group justify="flex-end">
              <Button
                type="button"
                variant="default"
                onClick={onClose}
                disabled={busy}
              >
                Закрыть
              </Button>
              {allocationId && canWrite && (
                <Button
                  type="button"
                  color="red"
                  variant="light"
                  disabled={busy || conflict || uncertain}
                  onClick={() =>
                    confirmCancel ? void cancel() : setConfirmCancel(true)
                  }
                >
                  {confirmCancel
                    ? "Подтвердить аннулирование"
                    : "Аннулировать распределение"}
                </Button>
              )}
              {canWrite && (
                <Button
                  type="submit"
                  loading={busy}
                  disabled={
                    !input ||
                    (method !== "pending" && !readyPreview) ||
                    conflict
                  }
                >
                  Сохранить распределение
                </Button>
              )}
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}

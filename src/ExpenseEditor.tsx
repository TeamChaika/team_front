import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NativeSelect,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError, money } from "./api";
import ExpenseFields, { type ExpenseDraft } from "./ExpenseFields";
import { AllocationHistory, methodOptions } from "./AllocationHistory";
import {
  allocationInput,
  amountForApi,
  canChangeExpense,
  canManageAllocation,
  type AllocationGroup,
  type AllocationMethod,
  type AllocationPart,
  type Expense,
  type FinanceAccess,
} from "./profitLossModel";
import { useAllocationPreview } from "./useAllocationPreview";
import type { Venue } from "./venueArchiveModel";

type Props = {
  allocationId?: string;
  row?: Expense;
  access: FinanceAccess;
  venues: Venue[];
  selectedVenue: string;
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
};
function initialDraft(
  source: AllocationGroup | Expense | undefined,
  today: string,
): ExpenseDraft {
  return {
    expense_date: source?.expense_date ?? today,
    paid_date: source?.paid_date ?? "",
    amount: source?.amount.replace(".", ",") ?? "",
    category: source?.category ?? "",
    payment_method: source?.payment_method ?? "",
    comment: source?.comment ?? "",
  };
}

export default function ExpenseEditor({
  allocationId,
  row,
  access,
  venues,
  selectedVenue,
  today,
  onClose,
  onSaved,
  onConflict,
}: Props) {
  const [group, setGroup] = useState<AllocationGroup | null>(null);
  const [loading, setLoading] = useState(!!allocationId);
  const [draft, setDraft] = useState<ExpenseDraft>(() =>
    initialDraft(allocationId ? undefined : row, today),
  );
  const [method, setMethod] = useState<AllocationMethod>("equal");
  const [parts, setParts] = useState<AllocationPart[]>(() =>
    selectedVenue && !allocationId ? [{ department_id: selectedVenue }] : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const sending = useRef(false);
  const retry = useRef<{
    path: string;
    method: "POST" | "PATCH";
    body: string;
  } | null>(null);

  const canAllocate = access === "accountant" || access === "owner";
  const directRow = allocationId ? undefined : row;
  const shared =
    !!allocationId || (canAllocate && !directRow && parts.length > 1);
  const canWrite = allocationId
    ? !!group && canManageAllocation(access, group)
    : !directRow || canChangeExpense(access, directRow);
  const locked = !canWrite || busy || uncertain || conflict;
  const input =
    shared && canWrite
      ? allocationInput(draft.amount, draft.expense_date, method, parts)
      : null;
  const estimate = useAllocationPreview(input, !allocationId && !directRow);
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
  function selectVenues(ids: string[]) {
    setError("");
    setParts((current) =>
      ids.map(
        (id) =>
          current.find((part) => part.department_id === id) ?? {
            department_id: id,
          },
      ),
    );
  }
  const weight = (id: string, value: string) =>
    setParts((current) =>
      current.map((part) =>
        part.department_id === id ? { ...part, weight: value } : part,
      ),
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || busy || conflict || !canWrite) return;
    let submission = retry.current;
    if (!submission) {
      const amount = amountForApi(draft.amount);
      if (
        !amount ||
        !draft.expense_date ||
        !draft.category ||
        !draft.payment_method
      ) {
        setError("Введите сумму, дату расхода, статью и способ оплаты.");
        return;
      }
      const values = {
        ...draft,
        amount,
        paid_date: draft.paid_date || null,
        comment: draft.comment.trim(),
      };
      let path: string;
      let body: string;
      if (shared) {
        if (!input || (method !== "pending" && !estimate.preview)) {
          setError("Проверьте состав заведений и дождитесь расчёта долей.");
          return;
        }
        const confirmedParts =
          method === "pending"
            ? input.parts
            : input.parts.map((part) => ({
                ...part,
                amount: estimate.preview!.parts.find(
                  (item) => item.department_id === part.department_id,
                )!.amount,
              }));
        path =
          "/profit-loss/allocations" + (allocationId ? "/" + allocationId : "");
        body = JSON.stringify({
          ...values,
          ...input,
          parts: confirmedParts,
          ...(allocationId
            ? { revision: group!.revision }
            : { request_id: requestId }),
        });
      } else {
        const departmentId =
          directRow?.department_id ?? parts[0]?.department_id;
        if (
          !departmentId ||
          (!directRow && !venues.some((v) => v.id === departmentId))
        ) {
          setError("Выберите заведение для расхода.");
          return;
        }
        path = "/profit-loss/expenses" + (directRow ? "/" + directRow.id : "");
        body = JSON.stringify({
          ...values,
          ...(directRow
            ? { revision: directRow.revision }
            : { department_id: departmentId, request_id: requestId }),
        });
      }
      submission = {
        path,
        body,
        method: directRow || allocationId ? "PATCH" : "POST",
      };
    }
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      await api(submission.path, {
        method: submission.method,
        body: submission.body,
      });
      onSaved();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) {
        retry.current = submission;
        setUncertain(true);
      } else {
        retry.current = null;
        setUncertain(false);
      }
      setError(
        e instanceof ApiError
          ? e.message
          : "Сохранение не подтверждено. Повторите запрос в этой форме.",
      );
      if (
        shared &&
        e instanceof ApiError &&
        e.status === 409 &&
        e.message.includes("Распределение изменилось")
      ) {
        estimate.invalidate();
        setError(
          "Суммы долей изменились. Проверьте новый расчёт перед сохранением.",
        );
      } else if (e instanceof ApiError && [403, 404, 409].includes(e.status)) {
        setConflict(true);
        onConflict();
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    if (!group || locked || sending.current) return;
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
  const venueOptions = Array.from(names, ([value, label]) => ({
    value,
    label,
    disabled:
      !venues.some((venue) => venue.id === value) &&
      !parts.some((part) => part.department_id === value),
  }));
  const saveDisabled =
    conflict ||
    (!uncertain &&
      (shared
        ? !input || (method !== "pending" && !estimate.preview)
        : !directRow && parts.length !== 1));
  const allocationControls = shared && (
    <Stack gap="xs">
      <NativeSelect
        label="Способ распределения"
        data={methodOptions}
        value={method}
        onChange={(event) => {
          setMethod(event.currentTarget.value as AllocationMethod);
          setError("");
        }}
        disabled={locked}
      />
      {method === "weights" &&
        parts.map((part) => (
          <TextInput
            key={part.department_id}
            label={`Вес: ${names.get(part.department_id) ?? part.department_id}`}
            inputMode="decimal"
            value={part.weight ?? ""}
            placeholder="Например, 60 и 40"
            onChange={(event) =>
              weight(part.department_id, event.currentTarget.value)
            }
            disabled={locked}
          />
        ))}
      {method === "pending" && (
        <Text size="sm" c="dimmed">
          Счёт войдёт в расходы сети по дате расхода. Доли заведений можно
          указать позже.
        </Text>
      )}
      {method === "revenue" && (
        <Text size="sm" c="dimmed">
          Для расчёта нужны данные iiko за весь месяц расхода. Пока их нет,
          можно выбрать «Распределить позже».
        </Text>
      )}
      {estimate.error && (
        <Alert role="alert" color="red">
          {estimate.error}
        </Alert>
      )}
      {canWrite && method !== "pending" && (allocationId || estimate.error) && (
        <Button
          type="button"
          variant="light"
          onClick={estimate.calculate}
          disabled={locked || !input}
          loading={estimate.loading}
        >
          Рассчитать доли
        </Button>
      )}
      {!allocationId && estimate.loading && (
        <Text size="sm" c="dimmed" role="status">
          Рассчитываем доли…
        </Text>
      )}
      {estimate.preview && (
        <section
          aria-label="Предпросмотр распределения"
          className="pl-allocation-preview"
        >
          <strong>Доли по заведениям</strong>
          <dl>
            {estimate.preview.parts.map((part) => (
              <div key={part.department_id}>
                <dt>{names.get(part.department_id) ?? part.department_id}</dt>
                <dd>{money(part.amount)} ₽</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </Stack>
  );
  return (
    <Modal
      opened
      centered
      size="lg"
      title={
        allocationId
          ? "Распределённый расход"
          : directRow
            ? "Изменить расход"
            : "Добавить расход"
      }
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
            {allocationId && row && (
              <Text size="sm" c="dimmed">
                Доля {row.department}: {money(row.amount)} ₽. Изменения
                применятся ко всему расходу.
              </Text>
            )}
            {directRow ? (
              <TextInput
                label="Заведение"
                value={directRow.department}
                readOnly
              />
            ) : canAllocate ? (
              <MultiSelect
                label="Заведения"
                withAsterisk
                searchable
                placeholder={
                  parts.length
                    ? undefined
                    : "Выберите одно или несколько заведений"
                }
                data={venueOptions}
                value={parts.map((part) => part.department_id)}
                onChange={selectVenues}
                error={
                  allocationId && canWrite && parts.length < 2
                    ? "Для общего расхода выберите хотя бы два заведения."
                    : undefined
                }
                disabled={locked}
              />
            ) : (
              <Select
                label="Заведение"
                required
                searchable
                placeholder="Выберите заведение"
                data={venueOptions}
                value={parts[0]?.department_id ?? null}
                onChange={(id) => selectVenues(id ? [id] : [])}
                disabled={locked}
              />
            )}
            <ExpenseFields
              draft={draft}
              today={today}
              change={change}
              disabled={locked}
              afterAmount={allocationControls}
            />
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
                  disabled={locked}
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
                <Button type="submit" loading={busy} disabled={saveDisabled}>
                  {allocationId ? "Сохранить распределение" : "Сохранить"}
                </Button>
              )}
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}

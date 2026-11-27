import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
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
import { ExpenseApprovers } from "./ExpenseApprovers";
import { AllocationHistory, methodLabels } from "./AllocationHistory";
import {
  allocationBalance,
  allocationInput,
  amountForApi,
  canChangeExpense,
  canManageAllocation,
  expenseCategoryChoices,
  manualPartValue,
  type AllocationGroup,
  type AllocationMethod,
  type AllocationPart,
  type Expense,
  type ExpenseApprover,
  type ExpenseCategory,
  type FinanceAccess,
} from "./profitLossModel";
import { useAllocationPreview } from "./useAllocationPreview";
import { useData } from "./useData";
import type { Venue } from "./venueArchiveModel";

type Props = {
  allocationId?: string;
  distribute?: boolean;
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
  distribute = false,
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
  const [selectedMethod, setSelectedMethod] =
    useState<Exclude<AllocationMethod, "pending">>("equal");
  const [deferred, setDeferred] = useState(false);
  const method = deferred ? "pending" : selectedMethod;
  const [parts, setParts] = useState<AllocationPart[]>(() =>
    !allocationId &&
    row &&
    venues.some((venue) => venue.id === row.department_id)
      ? [{ department_id: row.department_id, approver_id: row.approver_id }]
      : !allocationId && !row && selectedVenue
        ? [{ department_id: selectedVenue }]
        : [],
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
  const directEditable = !!directRow && canChangeExpense(access, directRow);
  const directAllocatable =
    !!directRow && canAllocate && directRow.can_allocate === true;
  const shared =
    !!allocationId || distribute || (canAllocate && parts.length > 1);
  const canWrite = allocationId
    ? !!group && canManageAllocation(access, group)
    : !directRow || directEditable || directAllocatable;
  const locked = !canWrite || busy || uncertain || conflict;
  const approvers = useData<{ rows: ExpenseApprover[]; required?: boolean }>(
    canWrite ? "/profit-loss/approvers" : null,
  );
  const categoryList = useData<{ rows: ExpenseCategory[] }>(
    canWrite ? "/profit-loss/categories" : null,
  );
  const categoryOptions = expenseCategoryChoices(
    categoryList.data?.rows ?? [],
    group ?? directRow,
  );
  const selectedCategoryValid =
    !!categoryList.data &&
    categoryOptions.some(({ value }) => value === draft.category);
  const savedApprovers = group?.parts ?? (directRow ? [directRow] : []);
  const names = new Map(venues.map((venue) => [venue.id, venue.name]));
  if (directRow && venues.some((venue) => venue.id === directRow.department_id))
    names.set(directRow.department_id, directRow.department);
  for (const part of group?.parts ?? [])
    if (part.department) names.set(part.department_id, part.department);
  const approverFields = parts.map((part) => ({
    departmentId: part.department_id,
    department: names.get(part.department_id) ?? part.department_id,
    value: part.approver_id ?? "",
    options: (approvers.data?.rows ?? []).filter(
      (o) => o.department_id === part.department_id,
    ),
    saved: savedApprovers.find((p) => p.department_id === part.department_id),
  }));
  const approversReady =
    !!approvers.data &&
    approverFields.every((field) =>
      field.value
        ? field.saved?.approver_id === field.value ||
          field.options.some((option) => option.id === field.value)
        : !approvers.data?.required && !field.options.length,
    );
  const missingApprovers = approvers.data?.required
    ? approverFields.filter(
        (field) => !field.saved?.approver_id && !field.options.length,
      )
    : [];
  function chooseApprover(departments: string[], id: string) {
    setParts((current) =>
      current.map((part) =>
        departments.includes(part.department_id)
          ? { ...part, approver_id: id }
          : part,
      ),
    );
  }
  const input =
    shared &&
    canWrite &&
    (!directRow || directAllocatable) &&
    (!directRow ||
      parts.every((part) =>
        venues.some((venue) => venue.id === part.department_id),
      ))
      ? allocationInput(draft.amount, draft.expense_date, method, parts)
      : null;
  const estimate = useAllocationPreview(input, !allocationId);
  useEffect(() => {
    if (!allocationId) return;
    let active = true;
    api<AllocationGroup>("/profit-loss/allocations/" + allocationId)
      .then((result) => {
        if (!active) return;
        setGroup(result);
        setDraft(initialDraft(result, today));
        setDeferred(result.method === "pending");
        setSelectedMethod(
          result.method === "pending" ? "equal" : result.method,
        );
        setParts(
          result.parts.map(
            ({ department_id, weight, amount, approver_id }) => ({
              department_id,
              approver_id,
              weight:
                result.method === "percent" && weight
                  ? (manualPartValue("percent", weight) ?? weight).replace(
                      ".",
                      ",",
                    )
                  : result.method === "weights"
                    ? (weight ?? undefined)
                    : undefined,
              amount:
                result.method === "amount"
                  ? amount?.replace(".", ",")
                  : undefined,
            }),
          ),
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
            approver_id: savedApprovers.find(
              (part) => part.department_id === id,
            )?.approver_id,
          },
      ),
    );
  }
  const updatePart = (id: string, field: "weight" | "amount", value: string) =>
    setParts((current) =>
      current.map((part) =>
        part.department_id === id ? { ...part, [field]: value } : part,
      ),
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || busy || conflict || !canWrite) return;
    let submission = retry.current;
    if (!submission) {
      if (!approversReady) {
        setError("Проверьте выбор согласующего для каждого заведения.");
        return;
      }
      const amount = amountForApi(draft.amount);
      if (
        !amount ||
        !draft.expense_date ||
        !selectedCategoryValid ||
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
        if (directRow && !directAllocatable) {
          setError("Распределение этого расхода недоступно.");
          return;
        }
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
        path = directRow
          ? `/profit-loss/expenses/${directRow.id}/allocate`
          : "/profit-loss/allocations" +
            (allocationId ? "/" + allocationId : "");
        body = JSON.stringify({
          ...values,
          ...input,
          parts: confirmedParts.map((part) => ({
            ...part,
            approver_id:
              parts.find((item) => item.department_id === part.department_id)
                ?.approver_id ?? null,
          })),
          ...(allocationId
            ? { revision: group!.revision }
            : directRow
              ? { revision: directRow.revision, request_id: requestId }
              : { request_id: requestId }),
        });
      } else {
        if (directRow && !directEditable) {
          setError(
            "Для распределения выберите хотя бы два действующих заведения.",
          );
          return;
        }
        const departmentId = parts[0]?.department_id;
        if (
          parts.length !== 1 ||
          !departmentId ||
          (directRow && departmentId !== directRow.department_id) ||
          (!directRow && !venues.some((v) => v.id === departmentId))
        ) {
          setError(
            directRow
              ? "Для изменения прямого расхода оставьте исходное заведение или выберите хотя бы два для распределения."
              : "Выберите заведение для расхода.",
          );
          return;
        }
        path = "/profit-loss/expenses" + (directRow ? "/" + directRow.id : "");
        body = JSON.stringify({
          ...values,
          approver_id: parts[0].approver_id ?? null,
          ...(directRow
            ? { revision: directRow.revision }
            : { department_id: departmentId, request_id: requestId }),
        });
      }
      submission = {
        path,
        body,
        method: allocationId || (directRow && !shared) ? "PATCH" : "POST",
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
      } else if (e instanceof ApiError && e.status === 422) {
        // Another user may have changed the available choices while this draft was open.
        categoryList.reload();
        approvers.reload();
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
  const venueOptions = Array.from(names, ([value, label]) => ({
    value,
    label,
    disabled:
      !venues.some((venue) => venue.id === value) &&
      !parts.some((part) => part.department_id === value),
  }));
  const canChooseVenues = canAllocate && (!directRow || directAllocatable);
  const saveDisabled =
    conflict ||
    (!uncertain && (!approversReady || !selectedCategoryValid)) ||
    (!uncertain &&
      (shared
        ? !input || (method !== "pending" && !estimate.preview)
        : (!!directRow && !directEditable) ||
          parts.length !== 1 ||
          (!!directRow &&
            parts[0]?.department_id !== directRow.department_id)));
  const methodOptions: Exclude<AllocationMethod, "pending">[] = [
    "equal",
    "percent",
    "amount",
  ];
  if (group?.method === "weights" || group?.method === "revenue")
    methodOptions.push(group.method);
  const manual = method === "percent" || method === "amount";
  const balance = manual
    ? allocationBalance(method, parts, draft.amount)
    : null;
  const allocationControls = shared && (
    <Stack gap="xs">
      {!deferred && (
        <NativeSelect
          label="Способ распределения"
          data={methodOptions.map((value) => ({
            value,
            label: methodLabels[value],
          }))}
          value={selectedMethod}
          onChange={(event) => {
            setSelectedMethod(
              event.currentTarget.value as typeof selectedMethod,
            );
            setError("");
          }}
          disabled={locked}
        />
      )}
      {(manual || method === "weights") &&
        parts.map((part) => {
          const name = names.get(part.department_id) ?? part.department_id;
          const label =
            method === "percent"
              ? `Доля, % — ${name}`
              : method === "amount"
                ? `Сумма, ₽ — ${name}`
                : `Вес: ${name}`;
          const field = method === "amount" ? "amount" : "weight";
          const value = part[field] ?? "";
          return (
            <TextInput
              key={part.department_id}
              label={label}
              inputMode="decimal"
              value={value}
              error={
                manual && value && !manualPartValue(method, value)
                  ? method === "amount"
                    ? "Введите положительную сумму с точностью до копейки."
                    : "Введите долю больше 0 и до 100 % с точностью до 12 знаков."
                  : undefined
              }
              onChange={(event) =>
                updatePart(part.department_id, field, event.currentTarget.value)
              }
              disabled={locked}
            />
          );
        })}
      {balance && !balance.invalid && (
        <Text role="status" size="sm" c={balance.excess ? "red" : "dimmed"}>
          Распределено: {balance.total}
          {!balance.balanced &&
            ` · ${balance.excess ? "Превышение" : "Осталось распределить"}: ${balance.remainder}`}
          {balance.balanced &&
            !balance.complete &&
            " · Заполните долю каждого заведения"}
        </Text>
      )}
      <Checkbox
        label="Распределить позже"
        checked={deferred}
        onChange={(event) => {
          setDeferred(event.currentTarget.checked);
          setError("");
        }}
        disabled={locked}
      />
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
          : distribute
            ? "Распределить расход"
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
            {distribute && (
              <Text size="sm" c="dimmed">
                Выберите хотя бы два действующих заведения. После сохранения
                исходный расход останется в истории.
              </Text>
            )}
            {directRow &&
              !venues.some((venue) => venue.id === directRow.department_id) && (
                <Text size="sm" c="dimmed">
                  Исходное заведение: {directRow.department}. Оно архивное и не
                  может войти в новое распределение. Выберите действующие
                  заведения.
                </Text>
              )}
            {directRow && !canChooseVenues ? (
              <TextInput
                label="Заведение"
                value={directRow.department}
                readOnly
              />
            ) : canChooseVenues ? (
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
                  distribute && parts.length < 2
                    ? "Для распределения выберите хотя бы два заведения."
                    : directRow &&
                        parts.length === 1 &&
                        parts[0]?.department_id !== directRow.department_id
                      ? "Выберите исходное заведение или хотя бы два заведения для распределения."
                      : allocationId && canWrite && parts.length < 2
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
            {canWrite &&
              parts.length > 0 &&
              (approvers.error ? (
                <Alert color="red" role="alert">
                  Не удалось загрузить список согласующих.{" "}
                  <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    onClick={approvers.reload}
                  >
                    Повторить
                  </Button>
                </Alert>
              ) : approvers.loading ? (
                <Loader size="xs" aria-label="Загрузка согласующих" />
              ) : (
                <ExpenseApprovers
                  fields={approverFields}
                  disabled={locked}
                  onChoose={chooseApprover}
                />
              ))}
            {missingApprovers.length > 0 && (
              <Alert color="yellow">
                Для{" "}
                {missingApprovers
                  .map((field) => "«" + field.department + "»")
                  .join(", ")}{" "}
                нужно назначить согласующего в справочнике расходов.
              </Alert>
            )}
            {categoryList.error ? (
              <Alert color="red" role="alert">
                Не удалось загрузить статьи расходов.{" "}
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  onClick={categoryList.reload}
                >
                  Повторить
                </Button>
              </Alert>
            ) : canWrite && categoryList.data && !categoryOptions.length ? (
              <Alert color="yellow">
                Для ввода расхода нужна хотя бы одна активная статья в
                справочнике расходов.
              </Alert>
            ) : null}
            <ExpenseFields
              draft={draft}
              categoryOptions={categoryOptions}
              today={today}
              change={change}
              disabled={locked || (!!directRow && !directEditable)}
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
                  {allocationId
                    ? "Сохранить распределение"
                    : distribute
                      ? "Распределить расход"
                      : "Сохранить"}
                </Button>
              )}
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}

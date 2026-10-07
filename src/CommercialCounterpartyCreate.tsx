import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError } from "./api";
import {
  commercialPartyLabel,
  commercialUncertain,
  type CommercialKind,
  type CommercialParty,
} from "./commercialInvoiceModel";
import {
  counterpartyPayload,
  counterpartyPending,
  type CounterpartyDraft,
  type CounterpartyOperation,
} from "./commercialCounterpartyModel";

export function CommercialCounterpartyCreate({
  kind,
  name,
  operations,
  operationChanged,
  close,
  selected,
}: {
  kind: CommercialKind;
  name: string;
  operations: CounterpartyOperation[];
  operationChanged: (operation: CounterpartyOperation) => void;
  close: () => void;
  selected: (party: CommercialParty) => void;
}) {
  const [value, set] = useState<CounterpartyDraft>({
    entity_type: "organization",
    name,
    inn: "",
    kpp: "",
    address: "",
    phone: "",
    email: "",
  });
  const [operation, setOperation] = useState<CounterpartyOperation | null>(
    () => operations.find((op) => counterpartyPending(op.state)) ?? null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [candidates, setCandidates] = useState<CommercialParty[]>([]);
  const pending = useRef<ReturnType<typeof counterpartyPayload> | null>(null);
  const requestBase = `/commercial-invoices/${kind}`;
  const locked =
    busy ||
    uncertain ||
    Boolean(operation && counterpartyPending(operation.state));
  function result(next: CounterpartyOperation) {
    setOperation(next);
    operationChanged(next);
    setUncertain(false);
    if (next.state === "rejected") {
      setError(next.error || "iiko не приняла контрагента.");
      setCandidates(next.candidates ?? []);
      pending.current = null;
    }
  }
  useEffect(() => {
    if (!operation || !counterpartyPending(operation.state)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = operation.id;
    let attempts = 0;
    async function poll() {
      try {
        const response = await api<{ operation: CounterpartyOperation }>(
          `${requestBase}/counterparty-operations/${id}`,
        );
        if (stopped) return;
        result(response.operation);
        if (!counterpartyPending(response.operation.state)) return;
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped && ++attempts < 40) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [operation?.id, operation?.state, requestBase]);
  async function submit() {
    setError("");
    setCandidates([]);
    try {
      pending.current ??= counterpartyPayload(value, crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      const response = await api<{ operation: CounterpartyOperation }>(
        `${requestBase}/counterparties`,
        {
          method: "POST",
          body: JSON.stringify(pending.current),
        },
      );
      result(response.operation);
    } catch (e) {
      setError((e as Error).message);
      const unknown = commercialUncertain(e);
      setUncertain(unknown);
      if (!unknown) {
        pending.current = null;
        if (e instanceof ApiError && e.detail && typeof e.detail === "object") {
          const detail = e.detail as {
            code?: string;
            candidates?: CommercialParty[];
          };
          if (detail.code === "counterparty_duplicate")
            setCandidates(detail.candidates ?? []);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!operation) return;
    setBusy(true);
    setError("");
    try {
      result(
        (
          await api<{ operation: CounterpartyOperation }>(
            `${requestBase}/counterparty-operations/${operation.id}`,
          )
        ).operation,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const confirmed = operation?.state === "confirmed" && operation.counterparty;
  return (
    <Modal
      opened
      title="Новый контрагент"
      onClose={close}
      size="lg"
      closeOnClickOutside={false}
      closeOnEscape={!busy && !uncertain}
      withCloseButton={!busy && !uncertain}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void submit();
        }}
      >
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          {uncertain && (
            <Alert color="yellow">
              Ответ не получен. Повторная проверка сохранит тот же запрос и не
              создаст второго контрагента.
            </Alert>
          )}
          {confirmed ? (
            <>
              <Text>Контрагент создан в iiko.</Text>
              <Text fw={600}>{commercialPartyLabel(confirmed)}</Text>
              <Button onClick={() => selected(confirmed)}>
                Выбрать в накладной
              </Button>
            </>
          ) : operation && counterpartyPending(operation.state) ? (
            <>
              <Text>
                {operation.state === "unknown"
                  ? "Проверяем, сохранила ли iiko контрагента."
                  : "Сохраняем контрагента в iiko…"}
              </Text>
              <Button
                variant="light"
                onClick={() => void refresh()}
                loading={busy}
              >
                Проверить состояние
              </Button>
              <Button variant="default" onClick={close} disabled={busy}>
                Закрыть
              </Button>
            </>
          ) : (
            <>
              <Select
                label="Тип контрагента"
                allowDeselect={false}
                value={value.entity_type}
                disabled={locked}
                data={[
                  { value: "organization", label: "Организация" },
                  { value: "ip", label: "ИП" },
                  { value: "person", label: "Физическое лицо" },
                ]}
                onChange={(type) =>
                  type &&
                  set({
                    ...value,
                    entity_type: type as CounterpartyDraft["entity_type"],
                    kpp: type === "organization" ? value.kpp : "",
                  })
                }
              />
              <TextInput
                label={
                  value.entity_type === "organization" ? "Наименование" : "ФИО"
                }
                required
                maxLength={200}
                value={value.name}
                onChange={(e) => set({ ...value, name: e.currentTarget.value })}
                disabled={locked}
              />
              <Group grow align="flex-start">
                <TextInput
                  label="ИНН"
                  required={value.entity_type !== "person"}
                  maxLength={12}
                  inputMode="numeric"
                  value={value.inn}
                  onChange={(e) =>
                    set({ ...value, inn: e.currentTarget.value })
                  }
                  disabled={locked}
                />
                {value.entity_type === "organization" && (
                  <TextInput
                    label="КПП"
                    maxLength={9}
                    inputMode="numeric"
                    value={value.kpp}
                    onChange={(e) =>
                      set({ ...value, kpp: e.currentTarget.value })
                    }
                    disabled={locked}
                  />
                )}
              </Group>
              <TextInput
                label="Адрес"
                maxLength={500}
                value={value.address}
                onChange={(e) =>
                  set({ ...value, address: e.currentTarget.value })
                }
                disabled={locked}
              />
              <Group grow align="flex-start">
                <TextInput
                  label="Телефон"
                  type="tel"
                  maxLength={40}
                  value={value.phone}
                  onChange={(e) =>
                    set({ ...value, phone: e.currentTarget.value })
                  }
                  disabled={locked}
                />
                <TextInput
                  label="Email"
                  type="email"
                  maxLength={254}
                  value={value.email}
                  onChange={(e) =>
                    set({ ...value, email: e.currentTarget.value })
                  }
                  disabled={locked}
                />
              </Group>
              {candidates.length > 0 && (
                <Stack gap="xs">
                  <Text fw={600}>Похожие контрагенты уже есть</Text>
                  {candidates.map((party) => (
                    <Button
                      key={party.id}
                      variant="light"
                      onClick={() => selected(party)}
                      disabled={locked}
                    >
                      {commercialPartyLabel(party)}
                    </Button>
                  ))}
                </Stack>
              )}
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={close}
                  disabled={busy || uncertain}
                >
                  Отмена
                </Button>
                <Button type="submit" loading={busy}>
                  {uncertain ? "Повторить проверку" : "Создать в iiko"}
                </Button>
              </Group>
              {operations.some(
                (op) => op.state === "confirmed" && op.counterparty,
              ) && (
                <details>
                  <summary>Недавно созданные</summary>
                  <Stack gap="xs" mt="sm">
                    {operations
                      .filter(
                        (op) => op.state === "confirmed" && op.counterparty,
                      )
                      .map((op) => (
                        <Button
                          key={op.id}
                          variant="light"
                          onClick={() => selected(op.counterparty!)}
                          disabled={locked}
                        >
                          {commercialPartyLabel(op.counterparty!)}
                        </Button>
                      ))}
                  </Stack>
                </details>
              )}
            </>
          )}
        </Stack>
      </form>
    </Modal>
  );
}

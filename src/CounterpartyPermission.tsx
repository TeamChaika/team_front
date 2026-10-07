import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Group, Stack, Text } from "@mantine/core";
import { api } from "./api";
import { useData } from "./useData";
import { commercialUncertain } from "./commercialInvoiceModel";

export function CounterpartyPermission({ userId }: { userId: number }) {
  const state = useData<{
    users: { id: number; can_create: boolean; version: number }[];
  }>("/commercial-invoices/admin/counterparty-grants");
  const person = state.data?.users.find((user) => user.id === userId);
  const [checked, setChecked] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{
    request_id: string;
    version: number;
    can_create: boolean;
  } | null>(null);
  async function save() {
    if (!person) return;
    pending.current ??= {
      request_id: crypto.randomUUID(),
      version: person.version,
      can_create: checked ?? person.can_create,
    };
    setBusy(true);
    setError("");
    try {
      await api(`/commercial-invoices/admin/counterparty-grants/${userId}`, {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = null;
      setUncertain(false);
      setChecked(null);
      state.reload();
    } catch (e) {
      setError((e as Error).message);
      const unknown = commercialUncertain(e);
      setUncertain(unknown);
      if (!unknown) {
        pending.current = null;
        state.reload();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="xs" className="management-card">
      <Text fw={600}>Общий справочник контрагентов</Text>
      {(error || state.error) && (
        <Alert color="red">{error || state.error}</Alert>
      )}
      {uncertain && (
        <Text size="sm" c="orange">
          Ответ не получен. Повторите сохранение тех же прав.
        </Text>
      )}
      <Group justify="space-between">
        <Checkbox
          label="Создание контрагентов в iiko"
          checked={checked ?? person?.can_create ?? false}
          disabled={!person || busy || uncertain}
          onChange={(e) => setChecked(e.currentTarget.checked)}
        />
        <Button
          type="button"
          size="xs"
          variant="light"
          loading={busy}
          disabled={
            !person ||
            (!uncertain && (checked === null || checked === person.can_create))
          }
          onClick={() => void save()}
        >
          {uncertain ? "Повторить" : "Сохранить"}
        </Button>
      </Group>
    </Stack>
  );
}

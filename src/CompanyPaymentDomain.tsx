import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { getDashboardRuntime } from "./dashboardRuntime";
import {
  paymentDomainWrite,
  type PaymentDomainSettings,
} from "./paymentDomainModel";

export function CompanyPaymentDomain({ onChange }: { onChange(): void }) {
  const [settings, setSettings] = useState<PaymentDomainSettings | null>(null);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    let cancelled = false;
    const load = getDashboardRuntime()?.paymentDomainSettings;
    if (!load) return;
    load()
      .then((value) => {
        if (!cancelled) {
          setSettings(value);
          setDomain(value.domain ?? "");
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить домен оплаты.");
      });
    return () => {
      cancelled = true;
      live.current = false;
    };
  }, [retry]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const write = getDashboardRuntime()?.savePaymentDomainSettings;
    if (!settings || busy || !write) return;
    let body;
    try {
      body = paymentDomainWrite(settings, domain);
    } catch (reason) {
      setError((reason as Error).message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const value = await write(body);
      if (!live.current) return;
      setSettings(value);
      setDomain(value.domain ?? "");
      onChange();
    } catch (reason) {
      if (live.current)
        setError(
          (reason as Error).message || "Не удалось сохранить домен оплаты.",
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <Stack gap="sm">
      <Group>
        <Text fw={600}>Гостевая оплата</Text>
        <Badge color={settings?.status === "active" ? "green" : "gray"}>
          {settings?.status === "active"
            ? "Подключён"
            : settings?.status === "pending"
              ? "Ожидает подключения"
              : "Не настроен"}
        </Badge>
      </Group>
      {error && (
        <Alert color="red" role="alert">
          {error}
          <Button
            variant="subtle"
            disabled={busy}
            onClick={() => setRetry((v) => v + 1)}
          >
            Обновить
          </Button>
        </Alert>
      )}
      <form onSubmit={save}>
        <Stack gap="sm">
          <TextInput
            label="Домен оплаты"
            placeholder="pay.example.ru"
            value={domain}
            disabled={busy || !settings}
            maxLength={253}
            onChange={(event) => setDomain(event.currentTarget.value)}
          />
          <Text size="xs" c="dimmed">
            Домен заработает после проверки подключения.
          </Text>
          <Group>
            <Button
              type="submit"
              variant="light"
              loading={busy}
              disabled={
                !settings ||
                domain.trim().toLowerCase() === (settings.domain ?? "")
              }
            >
              Сохранить домен
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}

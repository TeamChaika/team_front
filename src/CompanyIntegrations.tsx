import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { getDashboardRuntime } from "./dashboardRuntime";
import {
  companyIntegrationsWrite,
  integrationApplyNotice,
  matchingIntegrationRevision,
  type CompanyIntegrations as Settings,
} from "./companyIntegrationsModel";

export function CompanyIntegrations({ onChange }: { onChange(): void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [token, setToken] = useState("");
  const [key, setKey] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [apply, setApply] = useState<Settings | null>(null);
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const [retry, setRetry] = useState(0);
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    const runtime = getDashboardRuntime();
    setSettings(null);
    setToken("");
    setKey("");
    setClearToken(false);
    setClearKey(false);
    setError("");
    setNotice("");
    setApply(null);
    ++sequence.current;
    if (!runtime?.integrationSettings) setError("Настройки недоступны.");
    else
      runtime
        .integrationSettings()
        .then((value) => {
          if (!controller.signal.aborted) {
            setSettings(value);
            setApply(value);
            if (value.apply_status)
              setNotice(integrationApplyNotice(value.apply_status));
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError("Не удалось загрузить настройки.");
        });
    return () => {
      live.current = false;
      controller.abort();
    };
  }, [retry]);
  useEffect(() => {
    if (apply?.apply_status !== "pending") return;
    const generation = sequence.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const latest = await getDashboardRuntime()?.integrationSettings?.();
        if (cancelled || generation !== sequence.current || !latest) return;
        if (!matchingIntegrationRevision(apply!, latest)) {
          setNotice(
            "Настройки изменены в другом сеансе. Обновите форму перед сохранением.",
          );
          return;
        }
        setNotice(integrationApplyNotice(latest.apply_status));
        if (latest.apply_status !== "pending") {
          setApply(latest);
          return;
        }
      } catch {
        /* A temporary status read failure leaves the saved settings pending. */
      }
      if (!cancelled && generation === sequence.current)
        timer = setTimeout(poll, 3000);
    }
    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apply]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const runtime = getDashboardRuntime();
    if (!settings || busy || !runtime?.saveIntegrationSettings) return;
    let body;
    try {
      body = companyIntegrationsWrite(
        settings,
        token,
        clearToken,
        key,
        clearKey,
      );
    } catch (reason) {
      setError((reason as Error).message);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await runtime.saveIntegrationSettings(body);
      if (!live.current) return;
      ++sequence.current;
      setSettings(value);
      setApply(value);
      setToken("");
      setKey("");
      setClearToken(false);
      setClearKey(false);
      setNotice(integrationApplyNotice(value.apply_status));
      onChange();
    } catch (reason) {
      if (live.current)
        setError(
          (reason as Error).message || "Не удалось сохранить настройки.",
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  const setAssistant = (patch: Partial<Settings["assistant"]>) =>
    setSettings(
      (value) =>
        value && { ...value, assistant: { ...value.assistant, ...patch } },
    );
  return (
    <Stack maw={640}>
      <Text size="sm" c="dimmed">
        Пустое поле сохраняет прежний секрет.
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error}
          <Button
            variant="subtle"
            disabled={busy}
            onClick={() => setRetry((v) => v + 1)}
          >
            Обновить настройки
          </Button>
        </Alert>
      )}
      {settings && (
        <Group>
          <Button
            variant="subtle"
            disabled={busy}
            onClick={() => setRetry((v) => v + 1)}
          >
            Обновить настройки
          </Button>
        </Group>
      )}
      {notice && (
        <Alert
          color={
            apply?.apply_status === "failed"
              ? "red"
              : apply?.apply_status === "applied"
                ? "green"
                : "blue"
          }
          role="status"
        >
          {notice}
        </Alert>
      )}
      {!settings ? (
        !error && <Loader />
      ) : (
        <form onSubmit={save} autoComplete="off">
          <Stack>
            <Group>
              <Text fw={600}>Telegram</Text>
              <Badge color={settings.missing.telegram ? "gray" : "green"}>
                {settings.missing.telegram ? "Не настроен" : "Настроен"}
              </Badge>
            </Group>
            <TextInput
              label="Имя бота"
              placeholder="@company_bot"
              maxLength={33}
              disabled={busy}
              value={settings.telegram.username}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  telegram: {
                    ...settings.telegram,
                    username: e.currentTarget.value,
                  },
                })
              }
            />
            <PasswordInput
              label="Токен бота"
              placeholder={
                settings.telegram.token_configured
                  ? "•••••••• — сохранён"
                  : "Не задан"
              }
              autoComplete="new-password"
              value={token}
              disabled={busy || clearToken}
              onChange={(e) => setToken(e.currentTarget.value)}
            />
            <Checkbox
              label="Удалить сохранённый токен"
              checked={clearToken}
              disabled={busy}
              onChange={(e) => {
                setClearToken(e.currentTarget.checked);
                setToken("");
              }}
            />
            <Group mt="sm">
              <Text fw={600}>ИИ-помощник</Text>
              <Badge color={settings.missing.assistant ? "gray" : "green"}>
                {settings.missing.assistant ? "Не настроен" : "Настроен"}
              </Badge>
            </Group>
            <Select
              label="Провайдер"
              data={[
                { value: "openai", label: "OpenAI" },
                { value: "openrouter", label: "OpenRouter" },
                { value: "timeweb", label: "Timeweb" },
              ]}
              value={settings.assistant.provider}
              allowDeselect={false}
              disabled={busy}
              onChange={(value) => {
                if (value) {
                  setAssistant({
                    provider: value as Settings["assistant"]["provider"],
                  });
                  setKey("");
                }
              }}
            />
            <Text size="xs" c="dimmed">
              При смене провайдера введите новый ключ.
            </Text>
            <TextInput
              label="Модель"
              value={settings.assistant.model}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setAssistant({ model: e.currentTarget.value })}
            />
            {settings.assistant.provider === "timeweb" && (
              <TextInput
                label="ID агента Timeweb"
                value={settings.assistant.agent_id || ""}
                disabled={busy}
                onChange={(e) =>
                  setAssistant({ agent_id: e.currentTarget.value || null })
                }
              />
            )}
            <PasswordInput
              label="Ключ API"
              placeholder={
                settings.assistant.key_configured
                  ? "•••••••• — сохранён"
                  : "Не задан"
              }
              autoComplete="new-password"
              value={key}
              disabled={busy || clearKey}
              onChange={(e) => setKey(e.currentTarget.value)}
            />
            <Checkbox
              label="Удалить сохранённый ключ"
              checked={clearKey}
              disabled={busy}
              onChange={(e) => {
                setClearKey(e.currentTarget.checked);
                setKey("");
              }}
            />
            <Group>
              <Button type="submit" loading={busy}>
                Сохранить
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Stack>
  );
}

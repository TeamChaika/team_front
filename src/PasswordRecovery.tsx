import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Alert, Button, PasswordInput, Stack, Text } from "@mantine/core";
import { IconBrandTelegram, IconShieldLock } from "@tabler/icons-react";
import { api, ApiError } from "./api";

export type RecoveryRequest = typeof api;
type RecoveryOptions = {
  request?: RecoveryRequest;
  companyName?: string;
};
import { newPasswordValidationError, telegramUrl } from "./profileRules";
import {
  recoveryCanRetry,
  recoveryTokenFromHash,
} from "./passwordRecoveryRules";

function RecoveryCard({
  title,
  children,
  companyName,
}: {
  companyName?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="password-gate">
      <section className="password-gate-card" aria-labelledby="recovery-title">
        <span className="recovery-brand">
          <IconShieldLock size={24} /> {companyName ?? "Chaika"}
        </span>
        <h1 id="recovery-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function ForgotPassword({
  request = api,
  companyName,
}: RecoveryOptions = {}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setUrl(null);
    void request<{ url: string }>("/auth/recovery/telegram", {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const safe = telegramUrl(result.url);
        if (!safe) throw new Error("Не удалось открыть бота. Повторите позже.");
        setUrl(safe);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError((cause as Error).message);
      });
    return () => controller.abort();
  }, [revision, request]);
  return (
    <RecoveryCard title="Забыли пароль?" companyName={companyName}>
      <Stack gap="lg">
        <Text c="dimmed" size="sm">
          Откройте нашего бота в Telegram, который вы подключили в «Мой
          профиль». Подтвердите восстановление — бот пришлёт одноразовую ссылку
          для нового пароля.
        </Text>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {url ? (
          <Button
            component="a"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconBrandTelegram size={19} />}
          >
            Открыть Telegram
          </Button>
        ) : error ? (
          <Button onClick={() => setRevision((value) => value + 1)}>
            Повторить
          </Button>
        ) : (
          <Button loading>Подключаем Telegram</Button>
        )}
        <Text c="dimmed" size="sm">
          Если Telegram ещё не подключён или доступ к нему потерян, обратитесь к
          администратору.
        </Text>
        <Button component="a" href="/" variant="subtle">
          Вернуться ко входу
        </Button>
      </Stack>
    </RecoveryCard>
  );
}

export function ResetPassword({
  request = api,
  companyName,
}: RecoveryOptions = {}) {
  const [token, setToken] = useState(() =>
    recoveryTokenFromHash(window.location.hash),
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    const clearAddress = () => {
      // Keep recovery proof in component memory only, out of history and future URLs.
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    };
    const readNewLink = () => {
      const incoming = recoveryTokenFromHash(window.location.hash);
      clearAddress();
      if (inFlight.current) return;
      setToken(incoming);
      setDone(false);
      setError("");
      setPassword("");
      setConfirmation("");
    };
    clearAddress();
    window.addEventListener("hashchange", readNewLink);
    return () => window.removeEventListener("hashchange", readNewLink);
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!token || inFlight.current) return;
    const validation = newPasswordValidationError(password, confirmation);
    if (validation) {
      setError(validation);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await request("/auth/recovery/reset", {
        method: "POST",
        body: JSON.stringify({ token, new_password: password }),
      });
      setDone(true);
      setToken(null);
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : undefined;
      setError(
        status === undefined
          ? "Не удалось подтвердить сохранение. Попробуйте войти с новым паролем. Если он не подходит, запросите новую ссылку в Telegram."
          : (cause as Error).message,
      );
      if (!recoveryCanRetry(status)) setToken(null);
    } finally {
      setPassword("");
      setConfirmation("");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <RecoveryCard
      title={done ? "Пароль изменён" : "Новый пароль"}
      companyName={companyName}
    >
      <Stack gap="lg">
        {done ? (
          <Text role="status">Теперь войдите с новым паролем.</Text>
        ) : token ? (
          <Stack component="form" gap="md" onSubmit={save}>
            <Text c="dimmed" size="sm">
              Придумайте пароль от 8 до 128 символов.
            </Text>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <PasswordInput
              label="Новый пароль"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
              disabled={busy}
            />
            <PasswordInput
              label="Повторите новый пароль"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
              disabled={busy}
            />
            <Button type="submit" loading={busy} disabled={busy}>
              Сохранить пароль
            </Button>
          </Stack>
        ) : (
          <>
            <Alert color="orange" role="alert">
              {error ||
                "Откройте одноразовую ссылку из нашего бота в Telegram."}
            </Alert>
            <Button component="a" href="/forgot-password">
              Получить новую ссылку
            </Button>
          </>
        )}
        <Button
          component="a"
          href="/"
          variant={done ? "filled" : "subtle"}
          disabled={busy}
        >
          Вернуться ко входу
        </Button>
      </Stack>
    </RecoveryCard>
  );
}

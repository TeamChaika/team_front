import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBrandTelegram,
  IconRefresh,
  IconShieldLock,
} from "@tabler/icons-react";
import { api, type Meta } from "./api";
import { telegramUrl } from "./profileRules";
import { PasswordForm } from "./PasswordForm";
import "./profile.css";

type TelegramStatus = {
  available: boolean;
  linked: boolean;
  telegram_id: string | null;
};
type TelegramLink = { url: string; expires_at: string };

export function ProfilePage({ user }: { user: Meta["user"] }) {
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramError, setTelegramError] = useState("");
  const [pendingLink, setPendingLink] = useState<TelegramLink | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const active = useRef(true);
  const statusRequest = useRef<AbortController | null>(null);
  const mutationInFlight = useRef(false);

  const refreshTelegram = useCallback(async () => {
    if (mutationInFlight.current) return;
    if (statusRequest.current && !statusRequest.current.signal.aborted) return;
    const controller = new AbortController();
    statusRequest.current = controller;
    try {
      const result = await api<TelegramStatus>("/profile/telegram", {
        signal: controller.signal,
      });
      if (!active.current || controller.signal.aborted) return;
      setTelegram(result);
      setTelegramError("");
      if (result.linked || !result.available) setPendingLink(null);
    } catch (error) {
      if (active.current && !controller.signal.aborted)
        setTelegramError((error as Error).message);
    } finally {
      if (statusRequest.current === controller) statusRequest.current = null;
      if (active.current) setTelegramLoading(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void refreshTelegram();
    const onFocus = () => void refreshTelegram();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshTelegram();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active.current = false;
      statusRequest.current?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshTelegram]);

  useEffect(() => {
    if (!pendingLink || telegram?.linked) return;
    const expires = Date.parse(pendingLink.expires_at);
    const deadline = expires;
    if (!Number.isFinite(expires) || deadline <= Date.now()) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= deadline) {
        window.clearInterval(timer);
        setPendingLink(null);
        void refreshTelegram();
        return;
      }
      if (document.visibilityState === "visible") void refreshTelegram();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [pendingLink, telegram?.linked, refreshTelegram]);

  async function connectTelegram() {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    statusRequest.current?.abort();
    setTelegramBusy(true);
    setTelegramError("");
    setPendingLink(null);
    try {
      const result = await api<TelegramLink>("/profile/telegram/link", {
        method: "POST",
      });
      if (!active.current) return;
      const validUrl = telegramUrl(result.url);
      const expiry = Date.parse(result.expires_at);
      if (!validUrl || !Number.isFinite(expiry) || expiry <= Date.now()) {
        throw new Error(
          "Сервер вернул неверную ссылку Telegram. Повторите попытку.",
        );
      }
      setPendingLink(result);
      try {
        window.location.assign(validUrl);
      } catch {
        setTelegramError(
          "Автоматический переход не удался. Откройте ссылку ниже.",
        );
      }
    } catch (error) {
      if (active.current) setTelegramError((error as Error).message);
    } finally {
      mutationInFlight.current = false;
      if (active.current) setTelegramBusy(false);
    }
  }

  async function unlinkTelegram() {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    statusRequest.current?.abort();
    setTelegramBusy(true);
    setTelegramError("");
    try {
      await api<{ linked: false }>("/profile/telegram/unlink", {
        method: "POST",
      });
      if (!active.current) return;
      setTelegram({ available: true, linked: false, telegram_id: null });
      setPendingLink(null);
      setConfirmUnlink(false);
    } catch (error) {
      if (active.current) setTelegramError((error as Error).message);
    } finally {
      mutationInFlight.current = false;
      if (active.current) setTelegramBusy(false);
    }
  }

  const link =
    pendingLink && Date.parse(pendingLink.expires_at) > Date.now()
      ? telegramUrl(pendingLink.url)
      : null;

  return (
    <div className="profile-page">
      <div className="profile-heading">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Личный кабинет
        </Text>
        <Title order={1}>Мой профиль</Title>
        <Text c="dimmed">{user.display_name}</Text>
      </div>
      <div className="profile-grid">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="md">
            <Group gap="sm">
              <IconShieldLock size={24} />
              <Title order={2} size="h3">
                Смена пароля
              </Title>
            </Group>
            <PasswordForm />
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="md">
            <Group gap="sm">
              <IconBrandTelegram size={24} />
              <Title order={2} size="h3">
                Telegram
              </Title>
            </Group>
            {telegramError && (
              <Alert color="red" role="alert">
                {telegramError}
              </Alert>
            )}
            {telegramLoading && !telegram ? (
              <Text c="dimmed">Проверяем подключение…</Text>
            ) : !telegram ? (
              <Button variant="light" onClick={() => void refreshTelegram()}>
                Повторить проверку
              </Button>
            ) : !telegram.available ? (
              <Text c="dimmed">
                Подключение Telegram сейчас недоступно. Смена пароля работает
                как обычно.
              </Text>
            ) : telegram.linked ? (
              <>
                <Badge color="green" variant="light">
                  Подключён
                </Badge>
                <Text size="sm">
                  Telegram ID: {telegram.telegram_id ?? "—"}
                </Text>
                {confirmUnlink ? (
                  <>
                    <Text size="sm">
                      Отключить Telegram от вашего аккаунта?
                    </Text>
                    <Group gap="sm">
                      <Button
                        color="red"
                        loading={telegramBusy}
                        onClick={() => void unlinkTelegram()}
                      >
                        Да, отключить
                      </Button>
                      <Button
                        variant="subtle"
                        disabled={telegramBusy}
                        onClick={() => setConfirmUnlink(false)}
                      >
                        Отмена
                      </Button>
                    </Group>
                  </>
                ) : (
                  <Button
                    variant="light"
                    color="red"
                    onClick={() => setConfirmUnlink(true)}
                  >
                    Отключить Telegram
                  </Button>
                )}
              </>
            ) : (
              <>
                <Badge color="gray" variant="light">
                  Не подключён
                </Badge>
                <Text size="sm" c="dimmed">
                  Подключите аккаунт, чтобы получать уведомления в Telegram.
                </Text>
                {link ? (
                  <>
                    <Button
                      component="a"
                      href={link}
                      leftSection={<IconBrandTelegram size={18} />}
                    >
                      Открыть Telegram
                    </Button>
                    <Text size="sm">
                      В открывшемся боте нажмите <strong>Start</strong> или
                      «Запустить». После этого вернитесь сюда: статус обновится
                      автоматически.
                    </Text>
                    <Text size="xs" c="dimmed">
                      Ссылка действует до{" "}
                      {new Date(pendingLink!.expires_at).toLocaleTimeString(
                        "ru-RU",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                      .
                    </Text>
                  </>
                ) : (
                  <Button
                    loading={telegramBusy}
                    onClick={() => void connectTelegram()}
                  >
                    Подключить Telegram
                  </Button>
                )}
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => void refreshTelegram()}
                >
                  Проверить подключение{" "}
                  <IconRefresh size={14} style={{ verticalAlign: "middle" }} />
                </Anchor>
              </>
            )}
          </Stack>
        </Paper>
      </div>
    </div>
  );
}

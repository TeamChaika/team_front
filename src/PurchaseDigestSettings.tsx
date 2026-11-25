import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError, dateText } from "./api";

const endpoint = "/management/purchase-digest";

type Delivery = {
  business_date: string;
  updated_at: string;
  state: string;
  error_code: string | null;
};
type Destination = {
  id: string;
  name: string;
  archived?: boolean;
  sync_enabled: boolean;
  enabled: boolean;
  chat_id: string | null;
  chat_title: string | null;
  revision: number;
  delivery: Delivery | null;
};
type Settings = {
  send_time: string;
  timezone: string;
  bot_configured: boolean;
  bot_username: string | null;
  departments: Destination[];
};
const deliveryStates: Record<string, string> = {
  sending: "Отправляется",
  sent: "Отправлено",
  unknown: "Нужно проверить доставку в Telegram",
  failed: "Ошибка отправки",
};
const deliveryErrors: Record<string, string> = {
  report_failed: "Не удалось собрать Excel",
  telegram_rate_limited: "Telegram ограничил частоту отправок",
  telegram_rejected: "Telegram отклонил отправку",
  bot_mismatch: "Изменился бот",
  bot_not_configured: "Бот не подключён",
};

function DestinationEditor({
  venue,
  settings,
  onClose,
  onSave,
  onConflict,
}: {
  venue: Destination;
  settings: Settings;
  onClose: () => void;
  onSave: (value: Settings) => void;
  onConflict: () => void;
}) {
  const [chat, setChat] = useState(venue.chat_id ?? "");
  const [enabled, setEnabled] = useState(venue.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const input = chat.trim();
  const link =
    /^(?:https:\/\/)?t\.me\/c\/([1-9]\d{0,15})\/[1-9]\d*(?:\/[1-9]\d*)?\/?(?:[?#][^\s]*)?$/i.exec(
      input,
    );
  const chatId = link ? `-100${link[1]}` : input;
  const validChat =
    /^-[1-9]\d{0,18}$/.test(chatId) && BigInt(chatId) > -(2n ** 63n);
  const unavailable =
    !settings.bot_configured || !venue.sync_enabled || venue.archived;
  const changed = enabled !== venue.enabled || chatId !== (venue.chat_id ?? "");
  async function save() {
    if (!changed || !validChat || busy || conflict || (enabled && unavailable))
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Settings>(`${endpoint}/${venue.id}`, {
        method: "PUT",
        body: JSON.stringify({
          revision: venue.revision,
          chat_id: chatId,
          enabled,
        }),
      });
      onSave(result);
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setConflict(stale);
      setError(
        stale
          ? "Настройки уже изменены. Откройте актуальную версию."
          : (reason as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      title={venue.name}
      centered
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Stack>
          <TextInput
            label="ID чата или ссылка на сообщение"
            description={
              settings.bot_username
                ? `Добавьте @${settings.bot_username.replace(/^@/, "")} в чат с правом отправлять файлы.`
                : undefined
            }
            placeholder="-100… или https://t.me/c/…"
            value={chat}
            disabled={busy || conflict}
            error={
              chatId && !validChat
                ? "Укажите отрицательный ID чата или ссылку вида t.me/c/… на сообщение в закрытом канале."
                : undefined
            }
            onChange={(event) => setChat(event.currentTarget.value)}
          />
          <Switch
            label={`Отправлять Excel в ${settings.send_time} МСК`}
            checked={enabled}
            disabled={busy || conflict || (Boolean(unavailable) && !enabled)}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
          {error && (
            <Alert role="alert" color="red">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" disabled={busy} onClick={onClose}>
              Отмена
            </Button>
            {conflict ? (
              <Button onClick={onConflict}>Обновить настройки</Button>
            ) : (
              <Button
                type="submit"
                loading={busy}
                disabled={
                  !changed || !validChat || (enabled && Boolean(unavailable))
                }
              >
                Сохранить
              </Button>
            )}
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function PurchaseDigestSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editor, setEditor] = useState<Destination | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<Settings>(endpoint, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setSettings(data);
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);
  const venues = settings?.departments
    .filter((v) => !v.archived || v.enabled)
    .sort(
      (a, b) =>
        Number(b.enabled) - Number(a.enabled) ||
        a.name.localeCompare(b.name, "ru"),
    );
  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text component="h2" size="lg" fw={600} m={0}>
            Отклонения закупочных цен
          </Text>
          {settings && (
            <Text size="sm" c="dimmed">
              Каждый день в {settings.send_time} МСК · отдельный Excel для
              каждого заведения
            </Text>
          )}
        </div>
        <Button
          variant="default"
          size="xs"
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          Обновить
        </Button>
      </Group>
      {loading && <Loader size="sm" aria-label="Загрузка каналов" />}
      {error && (
        <Alert role="alert" color="red">
          {error}
        </Alert>
      )}
      {settings && !settings.bot_configured && (
        <Alert color="yellow">
          Для рассылки нужно подключить Telegram-бота.
        </Alert>
      )}
      {settings && venues?.length ? (
        <Table.ScrollContainer minWidth={690}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Заведение</Table.Th>
                <Table.Th>Чат Telegram</Table.Th>
                <Table.Th>Рассылка</Table.Th>
                <Table.Th>Последняя отправка</Table.Th>
                <Table.Th aria-label="Настройки" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {venues.map((v) => {
                const inactive = !v.sync_enabled || v.archived;
                const paused =
                  v.enabled && (inactive || !settings.bot_configured);
                return (
                  <Table.Tr key={v.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {v.name}
                      </Text>
                      {inactive && (
                        <Text size="xs" c="dimmed">
                          {v.archived ? "В архиве" : "Синхронизация выключена"}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{v.chat_title || v.chat_id || "—"}</Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={paused ? "yellow" : v.enabled ? "teal" : "gray"}
                      >
                        {paused
                          ? "Приостановлена"
                          : v.enabled
                            ? "Включена"
                            : "Выключена"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {v.delivery ? (
                        <>
                          <Text size="sm">
                            {deliveryStates[v.delivery.state] ??
                              "Статус уточняется"}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Отчёт за {dateText(v.delivery.business_date)} ·{" "}
                            {dateText(v.delivery.updated_at)} МСК
                          </Text>
                          {v.delivery.error_code &&
                            deliveryErrors[v.delivery.error_code] && (
                              <Text size="xs" c="dimmed">
                                {deliveryErrors[v.delivery.error_code]}
                              </Text>
                            )}
                        </>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        variant="default"
                        size="xs"
                        aria-label={`Настроить рассылку для ${v.name}`}
                        disabled={
                          loading ||
                          Boolean(error) ||
                          (Boolean(inactive) && !v.enabled)
                        }
                        onClick={() => setEditor(v)}
                      >
                        Настроить
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        settings && <Text c="dimmed">Нет доступных заведений.</Text>
      )}
      {editor && settings && (
        <DestinationEditor
          key={editor.id}
          venue={editor}
          settings={settings}
          onClose={() => setEditor(null)}
          onSave={(next) => {
            setSettings(next);
            setEditor(null);
          }}
          onConflict={() => {
            setEditor(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </Stack>
  );
}

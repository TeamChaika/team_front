import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconMessageExclamation } from "@tabler/icons-react";
import { api } from "./api";
import { getDashboardRuntime } from "./dashboardRuntime";
import {
  createSupportCapture,
  createSupportAttempt,
  supportStatuses,
  type SupportClient,
  type SupportPage,
} from "./supportModel";
function client(): SupportClient {
  return (
    getDashboardRuntime()?.support || {
      list: (offset) => api(`/support/tickets?limit=25&offset=${offset}`),
      create: (body) =>
        api("/support/tickets", { method: "POST", body: JSON.stringify(body) }),
      event: (body) =>
        api("/support/events", { method: "POST", body: JSON.stringify(body) }),
    }
  );
}
export default function Support({
  supportClient,
}: { supportClient?: SupportClient } = {}) {
  const resolveClient = () => supportClient || client();
  const [opened, setOpened] = useState(false);
  const [description, setDescription] = useState("");
  const [page, setPage] = useState<SupportPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef(createSupportAttempt());
  useEffect(() => {
    const capture = createSupportCapture(
      (body) => (supportClient || client()).event(body),
      () => window.location.pathname,
    );
    const browser = () => capture("browser_error");
    const rejection = () => capture("unhandled_rejection");
    const apiError = (event: Event) => {
      const detail = (
        event as CustomEvent<{ status: number; requestId?: unknown }>
      ).detail;
      capture("api_error", detail.status, detail.requestId);
    };
    window.addEventListener("error", browser);
    window.addEventListener("unhandledrejection", rejection);
    window.addEventListener("support-api-error", apiError);
    return () => {
      window.removeEventListener("error", browser);
      window.removeEventListener("unhandledrejection", rejection);
      window.removeEventListener("support-api-error", apiError);
    };
  }, [supportClient]);
  useEffect(() => {
    if (!opened) return;
    let live = true;
    setLoading(true);
    setError("");
    resolveClient()
      .list(offset)
      .then((data) => {
        if (live) setPage(data);
      })
      .catch(() => {
        if (live) setError("Не удалось загрузить обращения.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [opened, offset, refresh, supportClient]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || description.trim().length < 10) return;
    setBusy(true);
    setError("");
    try {
      const ticket = await resolveClient().create(
        attempt.current.prepare(description, window.location.pathname),
      );
      setNotice(`Обращение №${ticket.id.slice(0, 8)} принято`);
      setDescription("");
      attempt.current.reset();
      setOffset(0);
      setRefresh((n) => n + 1);
    } catch {
      setError("Не удалось отправить обращение. Повторите попытку.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        className="support-trigger"
        variant="subtle"
        size="compact-sm"
        leftSection={<IconMessageExclamation size={18} />}
        onClick={() => setOpened(true)}
      >
        Сообщить о проблеме
      </Button>
      <Modal
        opened={opened}
        onClose={() => {
          if (!busy) setOpened(false);
        }}
        title="Поддержка"
        size="lg"
      >
        <Stack>
          {notice && (
            <Alert color="teal" role="status">
              {notice}
            </Alert>
          )}
          {error && (
            <Alert color="red" role="alert">
              {error}{" "}
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Обновить
              </Button>
            </Alert>
          )}
          <form onSubmit={submit}>
            <Stack>
              <Textarea
                label="Что случилось?"
                placeholder="Опишите проблему и что вы ожидали получить"
                required
                minLength={10}
                maxLength={4000}
                autosize
                minRows={3}
                value={description}
                disabled={busy}
                onChange={(e) => {
                  setDescription(e.currentTarget.value);
                  attempt.current.reset();
                }}
              />
              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={busy}
                  disabled={description.trim().length < 10}
                >
                  Отправить
                </Button>
              </Group>
            </Stack>
          </form>
          <Text fw={600}>Мои обращения</Text>
          {loading ? (
            <Loader size="sm" aria-label="Загружаем обращения" />
          ) : page?.items.length ? (
            page.items.map((ticket) => (
              <div key={ticket.id}>
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    №{ticket.id.slice(0, 8)}
                  </Text>
                  <Badge>{supportStatuses[ticket.status]}</Badge>
                </Group>
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {ticket.description}
                </Text>
                <Text size="xs" c="dimmed">
                  {new Date(ticket.created_at).toLocaleString("ru-RU")}
                </Text>
              </div>
            ))
          ) : (
            !error && <Text c="dimmed">Обращений пока нет</Text>
          )}
          {page && page.total > 25 && (
            <Group justify="space-between">
              <Button
                variant="subtle"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((n) => Math.max(0, n - 25))}
              >
                Назад
              </Button>
              <Text size="sm">
                {offset + 1}–{Math.min(offset + 25, page.total)} из {page.total}
              </Text>
              <Button
                variant="subtle"
                disabled={offset + 25 >= page.total || loading}
                onClick={() => setOffset((n) => n + 25)}
              >
                Далее
              </Button>
            </Group>
          )}
        </Stack>
      </Modal>
    </>
  );
}

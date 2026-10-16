import { dashboardTheme } from "./dashboardTheme";
import { useEffect, useState } from "react";
import {
  MantineProvider,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
} from "@mantine/core";
import { api } from "./saasAdminApi";
import {
  supportStatuses,
  supportScreenLabels,
  supportCodeLabels,
  type SupportIncident,
  type SupportPage,
  type SupportStatus,
  type SupportTicket,
} from "./supportModel";
import type { Company } from "./saasAdminModel";
const date = (value: string) => new Date(value).toLocaleString("ru-RU");
function SupportView({ companies }: { companies: Company[] }) {
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOptions, setCompanyOptions] = useState(companies);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api
        .companies(companyQuery, "", 0)
        .then((data) => {
          if (live) setCompanyOptions(data.items);
        })
        .catch(() => {});
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [companyQuery]);
  const [tab, setTab] = useState<string | null>("tickets");
  const [company, setCompany] = useState<string | null>("");
  const [status, setStatus] = useState<string | null>("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<SupportPage<
    SupportTicket | SupportIncident
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<
    SupportTicket | SupportIncident | null
  >(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [nextStatus, setNextStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setPage(null);
    setError("");
    (tab === "tickets"
      ? api.supportTickets(company || "", status || "", offset)
      : api.supportEvents(company || "", offset)
    )
      .then((data) => {
        if (live) setPage(data);
      })
      .catch(() => {
        if (live) setError("Не удалось загрузить поддержку.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, company, status, offset, refresh]);
  useEffect(() => {
    if (!detailId) return;
    let live = true;
    setDetailLoading(true);
    setSelected(null);
    setDetailError("");
    (tab === "tickets"
      ? api.supportTicket(detailId)
      : api.supportEvent(detailId)
    )
      .then((data) => {
        if (live) {
          setSelected(data);
          if ("status" in data) setNextStatus(data.status);
        }
      })
      .catch(() => {
        if (live) setDetailError("Не удалось загрузить детали.");
      })
      .finally(() => {
        if (live) setDetailLoading(false);
      });
    return () => {
      live = false;
    };
  }, [detailId, tab]);
  async function changeStatus() {
    if (!selected || !("status" in selected) || !nextStatus || busy) return;
    setBusy(true);
    setDetailError("");
    try {
      setSelected(
        await api.supportStatus(
          selected,
          nextStatus as SupportStatus,
          note.trim(),
        ),
      );
      setNote("");
      setRefresh((n) => n + 1);
    } catch (e) {
      setDetailError(
        (e as { status?: number }).status === 409
          ? "Обращение уже изменено. Закройте и откройте его снова."
          : "Не удалось сохранить статус.",
      );
    } finally {
      setBusy(false);
    }
  }
  const ticket = selected && "status" in selected ? selected : null;
  return (
    <section className="sa-card" style={{ padding: 24 }}>
      <Stack>
        <Tabs
          value={tab}
          onChange={(value) => {
            setTab(value);
            setOffset(0);
            setDetailId(null);
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="tickets">Обращения</Tabs.Tab>
            <Tabs.Tab value="events">Технические ошибки</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <Group align="end">
          <Select
            label="Компания"
            searchable
            searchValue={companyQuery}
            onSearchChange={setCompanyQuery}
            clearable
            placeholder="Все компании"
            value={company || null}
            onChange={(value) => {
              setCompany(value);
              setOffset(0);
            }}
            data={[
              { value: "primary-dashboard", label: "Основной dashboard" },
              ...companyOptions.map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
          />
          {tab === "tickets" && (
            <Select
              clearable
              label="Статус"
              placeholder="Все статусы"
              data={Object.entries(supportStatuses).map(([value, label]) => ({
                value,
                label,
              }))}
              value={status || null}
              onChange={(value) => {
                setStatus(value);
                setOffset(0);
              }}
            />
          )}
          <Button variant="subtle" onClick={() => setRefresh((n) => n + 1)}>
            Обновить
          </Button>
        </Group>
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        {loading ? (
          <Loader size="sm" aria-label="Загрузка поддержки" />
        ) : page?.items.length ? (
          page.items.map((item) => (
            <button
              className="sa-button secondary"
              style={{
                textAlign: "left",
                whiteSpace: "normal",
                justifyContent: "space-between",
                width: "100%",
                height: "auto",
              }}
              key={item.id}
              onClick={() => {
                setNote("");
                setDetailId(item.id);
              }}
            >
              <span>
                <strong>
                  {item.company_name || "Основной dashboard"} · №
                  {item.id.slice(0, 8)}
                </strong>
                <br />
                {"description" in item
                  ? item.description.slice(0, 140)
                  : `${supportCodeLabels[item.code] || "Техническая ошибка"} · ${supportScreenLabels[item.screen] || "Другой экран"} · ${item.occurrences} раз`}
              </span>
              {"status" in item && (
                <Badge>{supportStatuses[item.status]}</Badge>
              )}
            </button>
          ))
        ) : (
          !error && (
            <Text c="dimmed">
              {tab === "tickets" ? "Обращений нет" : "Технических ошибок нет"}
            </Text>
          )
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
            <Text>
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
        <Modal
          opened={!!detailId}
          onClose={() => {
            if (!busy) {
              setDetailId(null);
              setSelected(null);
            }
          }}
          title={tab === "tickets" ? "Обращение" : "Техническая ошибка"}
          size="lg"
          styles={{ content: { color: "var(--mantine-color-text)" } }}
        >
          <Stack>
            {detailError && (
              <Alert color="red" role="alert">
                {detailError}
              </Alert>
            )}
            {detailLoading && <Loader size="sm" />}
            {selected && (
              <>
                <Text fw={600}>
                  {selected.company_name || "Основной dashboard"} · №
                  {selected.id.slice(0, 8)}
                </Text>
                <Text size="sm">
                  Экран:{" "}
                  {supportScreenLabels[selected.screen] || "Другой экран"}
                </Text>
                {ticket ? (
                  <>
                    <Text size="sm">
                      Автор: {ticket.actor_name || ticket.actor_id}
                    </Text>
                    <Text
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {ticket.description}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {date(ticket.created_at)}
                    </Text>
                    <Select
                      label="Статус"
                      value={nextStatus}
                      onChange={setNextStatus}
                      data={Object.entries(supportStatuses).map(
                        ([value, label]) => ({ value, label }),
                      )}
                      disabled={busy}
                    />
                    <Textarea
                      label="Комментарий к изменению"
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.currentTarget.value)}
                      disabled={busy}
                    />
                    <Button
                      onClick={() => void changeStatus()}
                      loading={busy}
                      disabled={!nextStatus || nextStatus === ticket.status}
                    >
                      Сохранить статус
                    </Button>
                    {ticket.event && (
                      <Text size="sm">
                        Ошибка:{" "}
                        {supportCodeLabels[ticket.event.code] ||
                          "Техническая ошибка"}{" "}
                        ·{" "}
                        {supportScreenLabels[ticket.event.screen] ||
                          "Другой экран"}{" "}
                        · HTTP {ticket.event.status_code || "—"}
                        {ticket.event.request_id &&
                          ` · ID запроса: ${ticket.event.request_id}`}
                      </Text>
                    )}
                    <Text fw={600}>История статусов</Text>
                    {ticket.audit?.map((event, index) => (
                      <Text size="sm" key={event.id || index}>
                        {date(event.created_at)} ·{" "}
                        {event.from_status &&
                          `${supportStatuses[event.from_status]} → `}
                        {
                          supportStatuses[
                            event.to_status || event.status || "new"
                          ]
                        }
                        {(event.actor_name || event.actor_id) &&
                          ` · ${event.actor_name || event.actor_id}`}
                        {event.note && ` · ${event.note}`}
                      </Text>
                    ))}
                  </>
                ) : (
                  "code" in selected && (
                    <>
                      <Text>
                        {supportCodeLabels[selected.code] ||
                          "Техническая ошибка"}{" "}
                        ·{" "}
                        {{
                          browser: "Интерфейс",
                          server: "Сервер",
                          background: "Фоновая задача",
                        }[selected.source] || "Сервис"}
                      </Text>
                      <Text>
                        HTTP: {selected.status_code || "—"} · Повторений:{" "}
                        {selected.occurrences}
                      </Text>
                      <Text size="sm">
                        Первое: {date(selected.first_seen)}
                        <br />
                        Последнее: {date(selected.last_seen)}
                      </Text>
                      {selected.request_id && (
                        <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                          ID запроса: {selected.request_id}
                        </Text>
                      )}
                    </>
                  )
                )}
              </>
            )}
          </Stack>
        </Modal>
      </Stack>
    </section>
  );
}

export default function SaasSupport(props: { companies: Company[] }) {
  return (
    <MantineProvider theme={dashboardTheme} forceColorScheme="light">
      <SupportView {...props} />
    </MantineProvider>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate, useMatch, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { IconDownload, IconPlus, IconRefresh } from "@tabler/icons-react";
import { api, apiCsv, dateText } from "./api";
import { ResourcePage } from "./pages";
import { useDocumentCache, useDocumentData } from "./DocumentData";
import { DocumentPanel } from "./DocumentPanel";
import { DocumentListItem } from "./DocumentListItem";
import { useWorkspace } from "./App";
import { DocumentEditor } from "./DocumentEditor";
import {
  documentStatuses,
  submissionLabel,
  type DocumentKind,
  type DocumentOptions,
  type DocumentRecord,
} from "./documentModel";
import "./documents.css";

const actionLabels: Record<string, string> = {
  confirm: "Согласовать",
  deny: "Отклонить",
  cancel: "Отменить заявку",
  edit: "Изменить",
  copy: "Создать копию",
};
const eventLabels: Record<string, string> = {
  create: "Создана заявка",
  edit: "Заявка изменена",
  copy: "Создана копия",
  confirm: "Документ согласован",
  deny: "Отклонено",
  cancel: "Отменено",
  iiko_sent: "iiko принял документ",
  iiko_rejected: "iiko отклонил документ",
  iiko_unknown: "Результат отправки требует проверки",
  reconciled_sent: "Отправка подтверждена сверкой с iiko",
  reconciled_absent:
    "Документ отсутствует в iiko — требуется новое согласование",
};

function DocumentCard({
  kind,
  id,
  close,
  changed,
  edit,
  options,
}: {
  kind: DocumentKind;
  id: string;
  close: () => void;
  changed: () => void;
  edit: (mode: "edit" | "copy", doc: DocumentRecord) => void;
  options: DocumentOptions | null;
}) {
  const state = useDocumentData<DocumentRecord>(`/documents/${kind}/${id}`);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState<string | null>(null);
  const confirmBlock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirmation) {
      confirmBlock.current?.focus();
      confirmBlock.current?.scrollIntoView({ block: "nearest" });
    }
  }, [confirmation]);
  const doc = state.data;
  const pending = doc && ["queued", "sending"].includes(doc.submission_state);
  useEffect(() => {
    if (!pending || state.refreshing) return;
    const timer = window.setTimeout(state.reload, 5000);
    return () => window.clearTimeout(timer);
  }, [pending, state.refreshing, state.reload]);
  async function act(action: string) {
    if (!doc) return;
    setBusy(true);
    setError("");
    try {
      await api(`/documents/${kind}/${doc.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          version: doc.version,
          request_id: crypto.randomUUID(),
        }),
      });
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmation(null);
      state.reload();
    }
  }
  return (
    <>
      <DocumentPanel
        close={() => {
          if (!busy) close();
        }}
        title={doc?.number || "Заявка"}
        busy={busy}
      >
        <Stack>
          {(state.error || error) && (
            <Alert color="red" role="alert">
              {state.error || error}
            </Alert>
          )}
          {state.loading && <Loader />}
          {doc && (
            <>
              <Group>
                <Badge>
                  {doc.submission_state === "queued"
                    ? "Согласован · в очереди"
                    : doc.submission_state === "sending"
                      ? "Отправляется"
                      : documentStatuses[doc.status] || doc.status}
                </Badge>
                <Text size="sm">Версия {doc.version}</Text>
              </Group>
              {doc.submission_state !== "idle" && (
                <Alert
                  color={doc.submission_state === "sent" ? "teal" : "yellow"}
                >
                  {submissionLabel(doc.submission_state)}
                  {doc.submission_state === "sent" &&
                    ". Проведение документа проверяется в iiko."}
                </Alert>
              )}
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Text>
                  <b>Склад:</b> {doc.store}
                </Text>
                <Text>
                  <b>{kind === "waybill" ? "Получатель" : "Причина"}:</b>{" "}
                  {doc.counteragent || doc.reason}
                </Text>
                <Text>
                  <b>Создал:</b> {doc.created_by}
                </Text>
                <Text>{dateText(doc.created_at)}</Text>
              </SimpleGrid>
              {doc.comment && (
                <Text style={{ whiteSpace: "pre-wrap" }}>{doc.comment}</Text>
              )}
              <Table.ScrollContainer minWidth={320}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Товар</Table.Th>
                      <Table.Th>Количество</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {doc.items.map((row) => (
                      <Table.Tr key={row.product_id}>
                        <Table.Td>{row.name}</Table.Td>
                        <Table.Td>{String(row.amount)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <Group>
                {doc.actions?.map((action) => (
                  <Button
                    key={action}
                    loading={busy}
                    color={
                      action === "deny" || action === "cancel"
                        ? "red"
                        : undefined
                    }
                    variant={action === "confirm" ? "filled" : "light"}
                    disabled={
                      busy ||
                      !!state.error ||
                      (!options && ["edit", "copy"].includes(action))
                    }
                    onClick={() =>
                      action === "edit" || action === "copy"
                        ? edit(action, doc)
                        : setConfirmation(action)
                    }
                  >
                    {actionLabels[action]}
                  </Button>
                ))}
              </Group>
              <Text fw={600}>История действий</Text>
              {!doc.history?.length && (
                <Text size="sm" c="dimmed">
                  Документ перенесён с историей автора и статуса. Журнал новых
                  действий начнётся после подключения.
                </Text>
              )}
              {doc.history?.map((item, i) => (
                <Text size="sm" key={i}>
                  {dateText(item.created_at)} ·{" "}
                  {eventLabels[item.action] || item.action} · {item.actor} ·
                  версия {item.version}
                </Text>
              ))}
              <Button
                variant="default"
                leftSection={<IconRefresh size={16} />}
                onClick={state.reload}
                disabled={busy}
              >
                Обновить карточку
              </Button>
            </>
          )}
        </Stack>
        {confirmation && (
          <Alert
            color={confirmation === "confirm" ? "cyan" : "red"}
            title={actionLabels[confirmation]}
            mt="md"
            role="region"
            aria-label="Подтверждение действия"
            ref={confirmBlock}
            tabIndex={-1}
          >
            <Stack>
              <Text>
                Заявка {doc?.number}, версия {doc?.version}.
              </Text>
              <Text>
                {confirmation === "confirm"
                  ? "Проверьте склады, товары и количества. После согласования документ попадёт в очередь и отправится в iiko автоматически. Ждать ответа iiko не нужно."
                  : "Действие будет записано в историю заявки."}
              </Text>
              <Group justify="flex-end">
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => setConfirmation(null)}
                >
                  Назад
                </Button>
                <Button
                  loading={busy}
                  color={confirmation === "confirm" ? undefined : "red"}
                  onClick={() => {
                    if (confirmation) void act(confirmation);
                  }}
                >
                  Подтвердить
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}
      </DocumentPanel>
    </>
  );
}

export function DocumentsPage({ kind }: { kind: DocumentKind }) {
  const { meta } = useWorkspace();
  const canViewAnalytics = meta.departments.length > 0;
  const navigate = useNavigate();
  const resource = kind === "waybill" ? "transfers" : "writeoffs";
  const documentId = useMatch(`/${resource}/documents/:documentId`)?.params
    .documentId;
  const cache = useDocumentCache();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab =
    canViewAnalytics && !documentId && searchParams.get("view") === "analytics"
      ? "analytics"
      : "requests";
  const [page, setPage] = useState(1),
    [editor, setEditor] = useState<{
      mode: "create" | "edit" | "copy";
      document?: DocumentRecord;
    } | null>(null),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    status: "Created",
    direction: "all",
    store_id: "",
    query: "",
    date_from: "",
    date_to: "",
  });
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  );
  const options = useDocumentData<DocumentOptions>(
    `/documents/${kind}/options`,
    300_000,
  );
  const state = useDocumentData<{ rows: DocumentRecord[]; total: number }>(
    tab === "requests" ? `/documents/${kind}?${params}&page=${page}` : null,
    30_000,
  );
  const pending = state.data?.rows.some((doc) =>
    ["queued", "sending"].includes(doc.submission_state),
  );
  useEffect(() => {
    if (!pending || tab !== "requests" || documentId || state.refreshing)
      return;
    const timer = window.setTimeout(state.reload, 5000);
    return () => window.clearTimeout(timer);
  }, [pending, tab, documentId, state.refreshing, state.reload]);
  function changed() {
    cache.invalidate(`/documents/${kind}`);
  }
  function saved(result: DocumentRecord) {
    setEditor(null);
    changed();
    navigate(`/${resource}/documents/${result.id}`);
  }
  function filter(field: string, value: string) {
    setPage(1);
    setFilters((old) => ({ ...old, [field]: value }));
  }
  async function exportRows() {
    setExporting(true);
    setError("");
    try {
      const blob = await apiCsv(`/documents/${kind}/export?${params}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${resource}-requests.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div
      className={`document-workspace${editor || documentId ? " has-panel" : ""}`}
    >
      <Stack className="document-list" inert={editor ? true : undefined}>
        <div>
          <h1>{kind === "waybill" ? "Перемещения" : "Списания"}</h1>
          <Text c="dimmed">
            {kind === "waybill"
              ? "Заявки между складами оформляются расходными накладными iiko."
              : "Заявки на списание и согласование по складам."}
          </Text>
        </div>
        <Tabs
          value={tab}
          onChange={(value) => {
            if (documentId)
              navigate(
                `/${resource}${value === "analytics" ? "?view=analytics" : ""}`,
              );
            else
              setSearchParams(
                value === "analytics" ? { view: "analytics" } : {},
              );
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="requests">Заявки и согласование</Tabs.Tab>
            {canViewAnalytics && (
              <Tabs.Tab value="analytics">
                {kind === "waybill"
                  ? "Внутренние перемещения iiko"
                  : "Документы iiko"}
              </Tabs.Tab>
            )}
          </Tabs.List>
          <Tabs.Panel value="requests" pt="md">
            <Stack>
              <Group justify="space-between">
                <Button
                  variant="default"
                  leftSection={<IconRefresh size={16} />}
                  onClick={() => {
                    changed();
                  }}
                >
                  Обновить
                </Button>
                <Group>
                  <Button
                    variant="light"
                    leftSection={<IconDownload size={16} />}
                    onClick={exportRows}
                    loading={exporting}
                    disabled={!state.data}
                  >
                    Экспорт CSV
                  </Button>
                  {options.data?.grants.some((g) =>
                    g.actions.includes("create"),
                  ) && (
                    <Button
                      leftSection={<IconPlus size={16} />}
                      onClick={() => setEditor({ mode: "create" })}
                    >
                      Создать заявку
                    </Button>
                  )}
                </Group>
              </Group>
              <div className="document-filters">
                <Select
                  label="Статус"
                  value={filters.status}
                  onChange={(v) => filter("status", v || "")}
                  data={[
                    { value: "", label: "Все статусы" },
                    ...Object.entries(documentStatuses).map(
                      ([value, label]) => ({
                        value,
                        label,
                      }),
                    ),
                  ]}
                />
                <Select
                  label="Склад"
                  searchable
                  clearable
                  value={filters.store_id || null}
                  placeholder="Все доступные"
                  onChange={(v) => filter("store_id", v || "")}
                  data={(options.data?.stores || []).map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
                {kind === "waybill" && (
                  <Select
                    label="Направление"
                    value={filters.direction}
                    onChange={(v) => filter("direction", v || "all")}
                    data={[
                      { value: "all", label: "Все" },
                      { value: "incoming", label: "Входящие" },
                      { value: "outgoing", label: "Исходящие" },
                    ]}
                  />
                )}
                <TextInput
                  label="Поиск"
                  placeholder="Номер DJ… или комментарий"
                  maxLength={200}
                  value={filters.query}
                  onChange={(e) => filter("query", e.currentTarget.value)}
                />
                <TextInput
                  label="Дата с"
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => filter("date_from", e.currentTarget.value)}
                />
                <TextInput
                  label="Дата по"
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => filter("date_to", e.currentTarget.value)}
                />
              </div>
              {(state.error || options.error || error) && (
                <Alert color="red" role="alert">
                  {state.error || options.error || error}
                </Alert>
              )}
              {state.loading && <Loader />}
              {state.data && (
                <>
                  <Text size="sm" c="dimmed">
                    Найдено: {state.data.total}
                  </Text>
                  {!state.data.rows.length && (
                    <Text>По выбранным фильтрам заявок нет.</Text>
                  )}
                  {state.data.rows.map((doc) => (
                    <DocumentListItem
                      key={doc.id}
                      kind={kind}
                      doc={doc}
                      selected={documentId === String(doc.id)}
                    />
                  ))}
                  {state.data.total > 30 && (
                    <Pagination
                      value={page}
                      onChange={setPage}
                      total={Math.ceil(state.data.total / 30)}
                      siblings={1}
                    />
                  )}
                </>
              )}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="analytics" pt="md">
            {tab === "analytics" && (
              <ResourcePage
                resource={resource}
                title={
                  kind === "waybill"
                    ? "Внутренние перемещения iiko"
                    : "Списания iiko"
                }
              />
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
      {editor && options.data ? (
        <DocumentEditor
          key={`${editor.mode}-${editor.document?.id || "new"}`}
          kind={kind}
          options={options.data}
          mode={editor.mode}
          document={editor.document}
          close={() => setEditor(null)}
          saved={saved}
        />
      ) : documentId ? (
        <DocumentCard
          key={documentId}
          kind={kind}
          id={documentId}
          options={options.data}
          close={() => navigate(`/${resource}`)}
          changed={changed}
          edit={(mode, document) => setEditor({ mode, document })}
        />
      ) : null}
    </div>
  );
}

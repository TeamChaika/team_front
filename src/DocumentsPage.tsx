import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
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
import { useData } from "./useData";
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
  confirm: "Согласовать и отправить в iiko",
  deny: "Отклонить",
  cancel: "Отменить заявку",
  edit: "Изменить",
  copy: "Создать копию",
};
const eventLabels: Record<string, string> = {
  create: "Создана заявка",
  edit: "Заявка изменена",
  copy: "Создана копия",
  confirm: "Начата отправка в iiko",
  deny: "Отклонено",
  cancel: "Отменено",
  iiko_sent: "iiko принял документ",
  iiko_rejected: "iiko отклонил документ",
  iiko_unknown: "Результат отправки требует проверки",
};

function DocumentCard({
  kind,
  id,
  close,
  changed,
  saved,
  options,
}: {
  kind: DocumentKind;
  id: string;
  close: () => void;
  changed: () => void;
  saved: (doc: DocumentRecord) => void;
  options: DocumentOptions | null;
}) {
  const state = useData<DocumentRecord>(`/documents/${kind}/${id}`);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState<string | null>(null),
    [editing, setEditing] = useState<"edit" | "copy" | null>(null);
  const doc = state.data;
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
      <Modal
        opened
        onClose={() => {
          if (!busy) close();
        }}
        size="xl"
        title={doc?.number || "Заявка"}
        closeOnClickOutside={false}
        closeOnEscape={!busy}
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
                <Badge>{documentStatuses[doc.status] || doc.status}</Badge>
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
                      busy || (!options && ["edit", "copy"].includes(action))
                    }
                    onClick={() =>
                      action === "edit" || action === "copy"
                        ? setEditing(action)
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
      </Modal>
      <Modal
        opened={!!confirmation}
        onClose={() => {
          if (!busy) setConfirmation(null);
        }}
        title={confirmation ? actionLabels[confirmation] : "Подтверждение"}
        closeOnClickOutside={false}
        closeOnEscape={!busy}
      >
        <Stack>
          <Text>
            Заявка {doc?.number}, версия {doc?.version}.
          </Text>
          <Text>
            {confirmation === "confirm"
              ? "Документ будет отправлен в iiko. Проверьте склады, товары и количества в карточке перед согласованием."
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
      </Modal>
      {editing && doc && options && (
        <DocumentEditor
          kind={kind}
          document={doc}
          mode={editing}
          options={options}
          close={() => setEditing(null)}
          saved={(result) => {
            setEditing(null);
            changed();
            if (editing === "copy") saved(result);
            else state.reload();
          }}
        />
      )}
    </>
  );
}

export function DocumentsPage({ kind }: { kind: DocumentKind }) {
  const { meta } = useWorkspace();
  const canViewAnalytics = meta.departments.length > 0;
  const navigate = useNavigate(),
    { documentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab =
    canViewAnalytics && !documentId && searchParams.get("view") === "analytics"
      ? "analytics"
      : "requests";
  const resource = kind === "waybill" ? "transfers" : "writeoffs";
  const [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
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
  const options = useData<DocumentOptions>(`/documents/${kind}/options`);
  const state = useData<{ rows: DocumentRecord[]; total: number }>(
    tab === "requests" ? `/documents/${kind}?${params}&page=${page}` : null,
  );
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
    <Stack>
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
            setSearchParams(value === "analytics" ? { view: "analytics" } : {});
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
                  state.reload();
                  options.reload();
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
                    onClick={() => setCreate(true)}
                  >
                    Создать заявку
                  </Button>
                )}
              </Group>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              <Select
                label="Статус"
                value={filters.status}
                onChange={(v) => filter("status", v || "")}
                data={[
                  { value: "", label: "Все статусы" },
                  ...Object.entries(documentStatuses).map(([value, label]) => ({
                    value,
                    label,
                  })),
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
            </SimpleGrid>
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
                  <div className="management-card" key={doc.id}>
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Button
                          variant="subtle"
                          p={0}
                          onClick={() =>
                            navigate(`/${resource}/documents/${doc.id}`)
                          }
                        >
                          {doc.number}
                        </Button>
                        <Text fw={600}>
                          {doc.store}
                          {kind === "waybill" && ` → ${doc.counteragent}`}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {dateText(doc.created_at)} · {doc.created_by}
                        </Text>
                        {doc.reason && <Text size="sm">{doc.reason}</Text>}
                        {["sending", "unknown", "rejected"].includes(
                          doc.submission_state,
                        ) && (
                          <Text c="orange" size="sm">
                            {submissionLabel(doc.submission_state)}
                          </Text>
                        )}
                      </div>
                      <Badge>
                        {documentStatuses[doc.status] || doc.status}
                      </Badge>
                    </Group>
                  </div>
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
      {create && options.data && (
        <DocumentEditor
          kind={kind}
          options={options.data}
          close={() => setCreate(false)}
          saved={(result) => {
            setCreate(false);
            state.reload();
            navigate(`/${resource}/documents/${result.id}`);
          }}
        />
      )}
      {documentId && (
        <DocumentCard
          key={documentId}
          kind={kind}
          id={documentId}
          options={options.data}
          close={() => navigate(`/${resource}`)}
          changed={state.reload}
          saved={(result) => navigate(`/${resource}/documents/${result.id}`)}
        />
      )}
    </Stack>
  );
}

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconDownload, IconPlus, IconTrash } from "@tabler/icons-react";
import { api, apiPdf, dateText, money } from "./api";
import { useData } from "./useData";
import { useWorkspace } from "./App";
import { DocumentPanel } from "./DocumentPanel";
import { PageTitle, ResourcePage } from "./pages";
import {
  commercialCommand,
  commercialPartyLabel,
  commercialHistoryLabel,
  commercialPayload,
  commercialStatuses,
  commercialUncertain,
  type CommercialDocument,
  type CommercialDraft,
  type CommercialItem,
  type CommercialKind,
  type CommercialOptions,
  type CommercialParty,
} from "./commercialInvoiceModel";
import "./documents.css";
import "./commercialInvoice.css";
const base = (kind: CommercialKind) => `/commercial-invoices/${kind}`;
const emptyItem = (): CommercialItem => ({
  product_id: "",
  quantity: "",
  price: "",
  vat_rate: null,
  price_includes_vat: true,
});

export function CommercialPdfButton({
  path,
  name,
}: {
  path: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await apiPdf(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось скачать счёт.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="xs">
      <Button
        variant="light"
        leftSection={<IconDownload size={16} />}
        loading={busy}
        onClick={download}
      >
        Счёт на оплату · PDF
      </Button>
      {error && <Alert color="red">{error}</Alert>}
    </Stack>
  );
}

function ItemRow({
  kind,
  item,
  change,
  remove,
  disabled,
  rates,
  index,
}: {
  kind: CommercialKind;
  item: CommercialItem;
  change: (item: CommercialItem) => void;
  remove: () => void;
  disabled: boolean;
  rates: string[];
  index: number;
}) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const found = useData<{
    items: { id: string; name: string; unit?: string }[];
  }>(
    query.length >= 2
      ? `${base(kind)}/products?q=${encodeURIComponent(query)}`
      : null,
  );
  const rows = new Map((found.data?.items || []).map((p) => [p.id, p]));
  if (item.product_id && !rows.has(item.product_id))
    rows.set(item.product_id, {
      id: item.product_id,
      name: item.name || item.product_id,
      unit: item.unit,
    });
  return (
    <fieldset className="commercial-item">
      <legend>Позиция {index + 1}</legend>
      <Group justify="space-between" align="flex-start">
        <Select
          className="commercial-product"
          label="Товар"
          searchable
          value={item.product_id || null}
          searchValue={search}
          onSearchChange={setSearch}
          data={[...rows.values()].map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) =>
            change({
              ...item,
              product_id: id || "",
              name: rows.get(id || "")?.name,
              unit: rows.get(id || "")?.unit,
            })
          }
          disabled={disabled}
          error={found.error || undefined}
          nothingFoundMessage={found.loading ? "Поиск…" : "Товар не найден"}
        />
        <ActionIcon
          mt={25}
          aria-label={`Удалить позицию ${index + 1}`}
          disabled={disabled}
          color="red"
          variant="subtle"
          onClick={remove}
        >
          <IconTrash size={18} />
        </ActionIcon>
      </Group>
      <div className="commercial-numbers">
        <NumberInput
          label={`Количество${item.unit ? `, ${item.unit}` : ""}`}
          min={0}
          max={1e9}
          decimalScale={3}
          decimalSeparator=","
          value={item.quantity}
          onChange={(quantity) => change({ ...item, quantity })}
          disabled={disabled}
        />
        <NumberInput
          label="Цена, ₽"
          min={0}
          max={1e9}
          decimalScale={4}
          decimalSeparator=","
          value={item.price}
          onChange={(price) => change({ ...item, price })}
          disabled={disabled}
        />
        <Select
          label="НДС"
          value={item.vat_rate ?? "none"}
          data={[
            { value: "none", label: "Без НДС" },
            ...rates.map((rate) => ({ value: rate, label: `${rate}%` })),
          ]}
          onChange={(rate) =>
            change({ ...item, vat_rate: rate === "none" ? null : rate })
          }
          disabled={disabled}
        />
      </div>
      <Checkbox
        label="Цена включает НДС"
        checked={item.price_includes_vat}
        onChange={(e) =>
          change({ ...item, price_includes_vat: e.currentTarget.checked })
        }
        disabled={disabled}
      />
    </fieldset>
  );
}
function Editor({
  kind,
  options,
  document,
  close,
  saved,
}: {
  kind: CommercialKind;
  options: CommercialOptions;
  document?: CommercialDocument;
  close: () => void;
  saved: (doc: CommercialDocument) => void;
}) {
  const w = useWorkspace();
  const [value, set] = useState<CommercialDraft>(() =>
    document
      ? { ...document, items: document.items.map((x) => ({ ...x })) }
      : {
          store_id: "",
          counterparty_id: "",
          date:
            w.meta.today ||
            new Date().toLocaleDateString("en-CA", {
              timeZone: "Europe/Simferopol",
            }),
          external_number: "",
          comment: "",
          items: [emptyItem()],
        },
  );
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false);
  const pending = useRef<ReturnType<typeof commercialPayload> | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const found = useData<{ items: CommercialParty[] }>(
    query.length >= 2
      ? `${base(kind)}/counterparties?q=${encodeURIComponent(query)}`
      : null,
  );
  const selectedParty = useRef<CommercialParty | null>(null);
  const parties = new Map(
    (found.data?.items || []).map((p) => [p.id, commercialPartyLabel(p)]),
  );
  if (selectedParty.current)
    parties.set(
      selectedParty.current.id,
      commercialPartyLabel(selectedParty.current),
    );
  if (document?.counterparty_id)
    parties.set(
      document.counterparty_id,
      commercialPartyLabel(document.counterparty),
    );
  const locked = busy || uncertain;
  const stores = options.stores.filter((s) =>
    document ? s.can_edit : s.can_create,
  );
  function change(next: CommercialDraft) {
    set(next);
    setDirty(true);
  }
  async function save() {
    setError("");
    try {
      if (!pending.current)
        pending.current = commercialPayload(
          value,
          crypto.randomUUID(),
          document?.version,
          kind,
        );
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ document: CommercialDocument }>(
        document ? `${base(kind)}/${document.id}/edit` : base(kind),
        { method: "POST", body: JSON.stringify(pending.current) },
      );
      pending.current = null;
      setDirty(false);
      saved(result.document);
    } catch (e) {
      setError((e as Error).message);
      const unknown = commercialUncertain(e);
      setUncertain(unknown);
      if (!unknown) pending.current = null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <DocumentPanel
      title={
        document
          ? `Изменить ${document.number}`
          : kind === "purchase"
            ? "Новая приходная накладная"
            : "Новая реализация"
      }
      busy={locked}
      close={() => (dirty ? setDiscard(true) : close())}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          {uncertain && (
            <Alert color="yellow">
              Результат сохранения неизвестен. Повторите сохранение: будет
              отправлен тот же запрос.
            </Alert>
          )}
          <Select
            required
            label="Склад"
            value={value.store_id || null}
            data={stores.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(store_id) =>
              change({ ...value, store_id: store_id || "" })
            }
            disabled={locked}
          />
          <Select
            required
            label={kind === "purchase" ? "Поставщик" : "Покупатель"}
            placeholder="Поиск по названию или ИНН"
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            value={value.counterparty_id || null}
            data={[...parties].map(([value, label]) => ({ value, label }))}
            onChange={(counterparty_id) => {
              selectedParty.current =
                found.data?.items.find((p) => p.id === counterparty_id) || null;
              change({ ...value, counterparty_id: counterparty_id || "" });
            }}
            disabled={locked}
            error={found.error || undefined}
            nothingFoundMessage={
              found.loading ? "Поиск…" : "Контрагент не найден"
            }
          />
          <div className="commercial-numbers">
            <TextInput
              required
              type="date"
              label="Дата накладной"
              value={value.date}
              onChange={(e) =>
                change({ ...value, date: e.currentTarget.value })
              }
              disabled={locked}
            />
            <TextInput
              required={kind === "purchase"}
              label={kind === "purchase" ? "Номер поставщика" : "Внешний номер"}
              maxLength={100}
              value={value.external_number}
              onChange={(e) =>
                change({ ...value, external_number: e.currentTarget.value })
              }
              disabled={locked}
            />
          </div>
          {value.items.map((item, index) => (
            <ItemRow
              key={index}
              kind={kind}
              item={item}
              index={index}
              rates={options.vat_rates}
              disabled={locked}
              change={(item) =>
                change({
                  ...value,
                  items: value.items.map((row, i) =>
                    i === index ? item : row,
                  ),
                })
              }
              remove={() =>
                change({
                  ...value,
                  items: value.items.filter((_, i) => i !== index),
                })
              }
            />
          ))}
          <Button
            variant="subtle"
            leftSection={<IconPlus size={16} />}
            disabled={locked || value.items.length >= 200}
            onClick={() =>
              change({ ...value, items: [...value.items, emptyItem()] })
            }
          >
            Добавить товар
          </Button>
          <Textarea
            label="Комментарий"
            maxLength={1000}
            value={value.comment}
            onChange={(e) =>
              change({ ...value, comment: e.currentTarget.value })
            }
            disabled={locked}
          />
          <Text size="sm" c="dimmed">
            Сумма и НДС появятся после сохранения.
          </Text>
          <Group>
            <Button type="submit" loading={busy}>
              {uncertain ? "Повторить сохранение" : "Сохранить черновик"}
            </Button>
            <Button
              variant="default"
              disabled={locked}
              onClick={() => (dirty ? setDiscard(true) : close())}
            >
              Отмена
            </Button>
          </Group>
          {discard && (
            <Alert title="Закрыть без сохранения?" color="yellow">
              <Group mt="xs">
                <Button color="red" onClick={close}>
                  Закрыть
                </Button>
                <Button variant="default" onClick={() => setDiscard(false)}>
                  Продолжить
                </Button>
              </Group>
            </Alert>
          )}
        </Stack>
      </form>
    </DocumentPanel>
  );
}
function Card({
  kind,
  id,
  close,
  edit,
  changed,
}: {
  kind: CommercialKind;
  id: string;
  close: () => void;
  edit: (doc: CommercialDocument) => void;
  changed: () => void;
}) {
  const state = useData<{ document: CommercialDocument }>(
    `${base(kind)}/${id}`,
    true,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<ReturnType<typeof commercialCommand> | null>(null);
  const doc = state.data?.document;
  const terminalSeen = useRef<string | null>(null);
  useEffect(() => {
    if (
      !doc ||
      !["accepted", "processed", "rejected", "unknown"].includes(doc.state)
    )
      return;
    const signature = `${doc.id}:${doc.version}:${doc.state}`;
    if (terminalSeen.current !== signature) {
      terminalSeen.current = signature;
      changed();
    }
  }, [doc?.id, doc?.version, doc?.state, changed]);
  useEffect(() => {
    if (!doc || !["queued", "sending"].includes(doc.state)) return;
    const timer = setInterval(state.reload, 5000);
    return () => clearInterval(timer);
  }, [doc?.state, state.reload]);
  async function submit() {
    if (!doc) return;
    setError("");
    if (!pending.current)
      pending.current = commercialCommand(doc, crypto.randomUUID());
    setBusy(true);
    try {
      await api(`${base(kind)}/${id}/submit`, {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = null;
      setUncertain(false);
      setConfirm(false);
      state.reload();
      changed();
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
    <DocumentPanel
      title={doc?.number || "Накладная"}
      close={close}
      busy={busy || uncertain}
    >
      <Stack>
        {state.loading && <Loader />}
        {(state.error || error) && (
          <Alert color="red">{state.error || error}</Alert>
        )}
        {doc && (
          <>
            <Group>
              <Badge>{commercialStatuses[doc.state] || doc.state}</Badge>
              <Text size="sm">{dateText(doc.date)}</Text>
            </Group>
            <Text>{doc.store}</Text>
            <Text fw={600}>{doc.counterparty.name}</Text>
            {doc.external_number && (
              <Text size="sm">Внешний номер: {doc.external_number}</Text>
            )}
            {doc.items.map((item, i) => (
              <div className="commercial-saved-item" key={i}>
                <Text fw={500}>{item.name}</Text>
                <Text size="sm">
                  {item.quantity} {item.unit} × {money(item.price)} ₽
                </Text>
                <Text size="sm" c="dimmed">
                  {item.vat_rate === null
                    ? "Без НДС"
                    : `НДС ${item.vat_rate}% · ${money(item.vat)} ₽`}
                </Text>
                <Text fw={600}>{money(item.total)} ₽</Text>
              </div>
            ))}
            <div className="commercial-totals">
              <Group justify="space-between">
                <Text>Без НДС</Text>
                <Text>{money(doc.totals.net)} ₽</Text>
              </Group>
              <Group justify="space-between">
                <Text>НДС</Text>
                <Text>{money(doc.totals.vat)} ₽</Text>
              </Group>
              <Group justify="space-between">
                <Text fw={700}>Итого</Text>
                <Text fw={700}>{money(doc.totals.total)} ₽</Text>
              </Group>
            </div>
            {doc.comment && <Text size="sm">{doc.comment}</Text>}
            <Group>
              {doc.can_edit && !uncertain && (
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => edit(doc)}
                >
                  Изменить
                </Button>
              )}
              {doc.can_submit && !uncertain && (
                <Button disabled={busy} onClick={() => setConfirm(true)}>
                  Отправить в iiko
                </Button>
              )}
              {kind === "sale" && doc.can_pdf && (
                <CommercialPdfButton
                  path={`${base(kind)}/${id}/pdf`}
                  name={`Счёт-${doc.number}`}
                />
              )}
            </Group>
            {(confirm || uncertain) && (
              <Alert
                color="yellow"
                title={
                  uncertain
                    ? "Результат отправки неизвестен"
                    : "Отправить накладную в iiko?"
                }
              >
                {uncertain
                  ? "Повтор будет проверен по тому же запросу."
                  : `${doc.counterparty.name} · ${money(doc.totals.total)} ₽`}
                <Group mt="sm">
                  <Button loading={busy} onClick={submit}>
                    {uncertain ? "Повторить запрос" : "Отправить"}
                  </Button>
                  {!uncertain && (
                    <Button
                      variant="default"
                      disabled={busy}
                      onClick={() => setConfirm(false)}
                    >
                      Отмена
                    </Button>
                  )}
                </Group>
              </Alert>
            )}
            {doc.history && doc.history.length > 0 && (
              <Stack gap="xs">
                <Text fw={600}>История</Text>
                {doc.history.map((event, index) => (
                  <div key={index}>
                    <Text size="sm">
                      {commercialHistoryLabel(event.action)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {event.actor_name} · {dateText(event.created_at)}
                    </Text>
                  </div>
                ))}
              </Stack>
            )}
            {doc.state === "unknown" && (
              <Button variant="default" onClick={state.reload}>
                Проверить статус
              </Button>
            )}
          </>
        )}
      </Stack>
    </DocumentPanel>
  );
}
export function CommercialInvoices({ kind }: { kind: CommercialKind }) {
  const [params, setParams] = useSearchParams();
  const analytics = params.get("view") === "analytics";
  const options = useData<CommercialOptions>(
    analytics ? null : `${base(kind)}/options`,
  );
  const [offset, setOffset] = useState(0),
    [selection, setSelection] = useState<string | null>(null),
    [editing, setEditing] = useState<CommercialDocument | "new" | null>(null);
  const list = useData<{ items: CommercialDocument[]; total: number }>(
    !analytics && options.data
      ? `${base(kind)}?limit=25&offset=${offset}`
      : null,
    true,
  );
  const resource = kind === "purchase" ? "invoices" : "outgoing",
    title = kind === "purchase" ? "Приходные накладные" : "Реализация";
  return (
    <>
      <Tabs
        value={analytics ? "analytics" : "ours"}
        onChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "analytics") next.set("view", "analytics");
          else next.delete("view");
          setParams(next);
          setSelection(null);
          setEditing(null);
        }}
        mb="lg"
      >
        <Tabs.List>
          <Tabs.Tab value="ours" disabled={Boolean(editing || selection)}>
            Наши накладные
          </Tabs.Tab>
          <Tabs.Tab value="analytics" disabled={Boolean(editing || selection)}>
            Документы iiko
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {analytics ? (
        <ResourcePage resource={resource} title={title} />
      ) : (
        <>
          <PageTitle
            title={title}
            subtitle={
              kind === "purchase"
                ? "Поступление товаров от поставщика"
                : "Продажа товаров внешнему покупателю"
            }
            action={
              <Group>
                <Button
                  variant="default"
                  loading={list.refreshing}
                  disabled={Boolean(editing || selection) || !options.data}
                  onClick={list.reload}
                >
                  Обновить
                </Button>
                {options.data?.can_create ? (
                  <Button
                    leftSection={<IconPlus size={16} />}
                    disabled={Boolean(editing || selection)}
                    onClick={() => {
                      setSelection(null);
                      setEditing("new");
                    }}
                  >
                    Создать
                  </Button>
                ) : null}
              </Group>
            }
          />
          {options.loading && <Loader />}
          {options.error && <Alert color="red">{options.error}</Alert>}
          <div
            className={`document-workspace ${editing || selection ? "has-panel" : ""}`}
          >
            <section
              className="document-list"
              inert={Boolean(editing || selection)}
            >
              <Stack>
                {list.loading && <Loader />}
                {list.error && <Alert color="red">{list.error}</Alert>}
                {list.data?.items.map((doc) => (
                  <button
                    type="button"
                    key={doc.id}
                    className={`panel document-list-card commercial-card ${selection === doc.id ? "selected" : ""}`}
                    onClick={() => {
                      setEditing(null);
                      setSelection(doc.id);
                    }}
                  >
                    <Group justify="space-between">
                      <Text fw={600}>{doc.number}</Text>
                      <Badge>
                        {commercialStatuses[doc.state] || doc.state}
                      </Badge>
                    </Group>
                    <Text size="sm">
                      {dateText(doc.date)} · {doc.counterparty.name}
                    </Text>
                    <Group justify="space-between" mt="xs">
                      <Text size="sm" c="dimmed">
                        {doc.store}
                      </Text>
                      <Text fw={600}>{money(doc.totals.total)} ₽</Text>
                    </Group>
                  </button>
                ))}
                {list.data && !list.data.items.length && (
                  <Text c="dimmed">Накладных пока нет.</Text>
                )}
                {list.data && list.data.total > 25 && (
                  <Pagination
                    total={Math.ceil(list.data.total / 25)}
                    value={offset / 25 + 1}
                    onChange={(page) => setOffset((page - 1) * 25)}
                  />
                )}
              </Stack>
            </section>
            {editing && options.data ? (
              <Editor
                key={editing === "new" ? "new" : editing.id}
                kind={kind}
                options={options.data}
                document={editing === "new" ? undefined : editing}
                close={() => setEditing(null)}
                saved={(doc) => {
                  setEditing(null);
                  setSelection(doc.id);
                  list.reload();
                }}
              />
            ) : selection ? (
              <Card
                key={selection}
                kind={kind}
                id={selection}
                close={() => {
                  setSelection(null);
                  list.reload();
                }}
                edit={setEditing}
                changed={list.reload}
              />
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

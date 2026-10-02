import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { api, ApiError } from "./api";
import { useData } from "./useData";
import { DocumentPanel } from "./DocumentPanel";
import {
  documentPayload,
  type DocumentDraft,
  type DocumentItem,
  type DocumentKind,
  type DocumentOptions,
  type DocumentRecord,
} from "./documentModel";

function ProductRow({
  kind,
  item,
  change,
  remove,
  disabled,
}: {
  kind: DocumentKind;
  item: DocumentItem;
  change: (item: DocumentItem) => void;
  remove: () => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const found = useData<{ rows: { id: string; name: string }[] }>(
    query.length >= 2
      ? `/documents/${kind}/products?query=${encodeURIComponent(query)}`
      : null,
  );
  const rows = new Map((found.data?.rows || []).map((p) => [p.id, p.name]));
  if (item.product_id) rows.set(item.product_id, item.name || item.product_id);
  return (
    <div className="document-product-row">
      <div>
        <Select
          label="Товар"
          placeholder="Введите минимум 2 символа"
          searchable
          clearable
          disabled={disabled}
          value={item.product_id || null}
          searchValue={search}
          onSearchChange={setSearch}
          data={[...rows].map(([value, label]) => ({ value, label }))}
          onChange={(id) =>
            change({ ...item, product_id: id || "", name: rows.get(id || "") })
          }
          nothingFoundMessage={found.loading ? "Поиск…" : "Товар не найден"}
          error={found.error || undefined}
        />
      </div>
      <NumberInput
        label="Количество"
        value={item.amount}
        onChange={(amount) => change({ ...item, amount })}
        min={0}
        max={1e9}
        allowNegative={false}
        decimalSeparator=","
        disabled={disabled}
      />
      <ActionIcon
        aria-label="Удалить позицию"
        color="red"
        variant="subtle"
        mt={25}
        onClick={remove}
        disabled={disabled}
      >
        <IconTrash size={18} />
      </ActionIcon>
    </div>
  );
}

export function DocumentEditor({
  kind,
  options,
  document,
  mode = "create",
  close,
  saved,
}: {
  kind: DocumentKind;
  options: DocumentOptions;
  document?: DocumentRecord;
  mode?: "create" | "edit" | "copy";
  close: () => void;
  saved: (result: DocumentRecord) => void;
}) {
  const [value, set] = useState<DocumentDraft>(
    document
      ? {
          store_id: document.store_id,
          counteragent_id: document.counteragent_id,
          reason: document.reason,
          reason_id: document.reason_id,
          comment: document.comment,
          items: document.items.map((row) => ({ ...row })),
        }
      : {
          store_id: "",
          counteragent_id: "",
          comment: "",
          items: [{ product_id: "", amount: "" }],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const discardBlock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (discard) {
      discardBlock.current?.focus();
      discardBlock.current?.scrollIntoView({ block: "nearest" });
    }
  }, [discard]);
  const nonce = useRef(crypto.randomUUID());
  const pending = useRef<ReturnType<typeof documentPayload> | null>(null);
  const action = mode === "edit" ? "edit" : "create";
  const stores = options.stores.filter((s) =>
    options.grants.some(
      (g) => g.store_id === s.id && g.actions.includes(action),
    ),
  );
  function update(next: DocumentDraft) {
    setDirty(true);
    set(next);
  }
  function dismiss() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else close();
  }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      pending.current ||= documentPayload(
        kind,
        value,
        nonce.current,
        mode === "create" ? undefined : document?.version,
      );
      setBusy(true);
      const path =
        mode === "create"
          ? `/documents/${kind}`
          : `/documents/${kind}/${document!.id}/${mode}`;
      const result = await api<DocumentRecord>(path, {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      setDirty(false);
      saved(result);
    } catch (e) {
      setError((e as Error).message);
      if (pending.current && (!(e instanceof ApiError) || e.status >= 500))
        setUncertain(true);
      else {
        pending.current = null;
        nonce.current = crypto.randomUUID();
        setUncertain(false);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DocumentPanel
        close={dismiss}
        busy={busy}
        title={
          mode === "edit"
            ? "Изменить заявку"
            : mode === "copy"
              ? "Копия накладной"
              : kind === "waybill"
                ? "Новая накладная"
                : "Новое списание"
        }
      >
        <form onSubmit={submit} inert={discard ? true : undefined}>
          <Stack>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            {uncertain && (
              <Alert color="yellow">
                Ответ не получен. Поля сохранены; «Проверить результат» повторит
                тот же запрос без создания второй заявки.
              </Alert>
            )}
            <Text size="sm" c="dimmed">
              {kind === "waybill"
                ? "После согласования будет отправлена расходная накладная iiko."
                : "После согласования списание будет передано в iiko со статусом «Новый»."}
            </Text>
            <Select
              required
              label={kind === "waybill" ? "Со склада" : "Склад"}
              searchable
              data={stores.map((s) => ({ value: s.id, label: s.name }))}
              value={value.store_id || null}
              onChange={(id) => update({ ...value, store_id: id || "" })}
              disabled={busy || uncertain || mode === "edit"}
            />
            {kind === "waybill" ? (
              <Select
                required
                label="Получатель"
                searchable
                data={options.recipients
                  .filter((s) => s.id !== value.store_id)
                  .map((s) => ({ value: s.id, label: s.name }))}
                value={value.counteragent_id || null}
                onChange={(id) =>
                  update({ ...value, counteragent_id: id || "" })
                }
                disabled={busy || uncertain || mode === "edit"}
              />
            ) : (
              <Select
                required
                label="Причина списания"
                data={options.reasons.map((r) => ({
                  value: String(r.id),
                  label: r.name,
                }))}
                value={value.reason_id ? String(value.reason_id) : null}
                disabled={busy || uncertain}
                onChange={(id) => {
                  const reason = options.reasons.find(
                    (r) => String(r.id) === id,
                  );
                  update({
                    ...value,
                    reason_id: reason?.id,
                    reason: reason?.name,
                  });
                }}
              />
            )}
            <Textarea
              label="Комментарий"
              maxLength={1000}
              value={value.comment}
              description={`${value.comment.length}/1000`}
              disabled={busy || uncertain}
              onChange={(e) =>
                update({ ...value, comment: e.currentTarget.value })
              }
            />
            {value.items.map((item, index) => (
              <ProductRow
                key={index}
                kind={kind}
                item={item}
                disabled={busy || uncertain}
                change={(row) =>
                  update({
                    ...value,
                    items: value.items.map((old, i) =>
                      i === index ? row : old,
                    ),
                  })
                }
                remove={() =>
                  update({
                    ...value,
                    items: value.items.filter((_, i) => i !== index),
                  })
                }
              />
            ))}
            <Button
              variant="light"
              leftSection={<IconPlus size={16} />}
              disabled={busy || uncertain || value.items.length >= 200}
              onClick={() =>
                update({
                  ...value,
                  items: [...value.items, { product_id: "", amount: "" }],
                })
              }
            >
              Добавить позицию
            </Button>
            <Group justify="flex-end">
              <Button variant="default" onClick={dismiss} disabled={busy}>
                Отмена
              </Button>
              <Button type="submit" loading={busy}>
                {uncertain
                  ? "Проверить результат"
                  : mode === "edit"
                    ? "Сохранить изменения"
                    : "Создать заявку"}
              </Button>
            </Group>
          </Stack>
        </form>
        {discard && (
          <Alert
            color="yellow"
            title="Закрыть форму без сохранения?"
            mt="md"
            role="region"
            aria-label="Несохранённые изменения"
            ref={discardBlock}
            tabIndex={-1}
          >
            <Stack>
              <Text>
                {uncertain
                  ? "Ответ сервера не получен. Заявка могла сохраниться. Перед повторным созданием проверьте список заявок."
                  : "Введённые изменения будут потеряны."}
              </Text>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setDiscard(false)}>
                  Продолжить заполнение
                </Button>
                <Button color="red" onClick={close}>
                  Закрыть форму
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}
      </DocumentPanel>
    </>
  );
}

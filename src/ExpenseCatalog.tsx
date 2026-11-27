import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError } from "./api";
import { useData } from "./useData";

const endpoint = "/profit-loss/catalog";
type Category = {
  code: string;
  name: string;
  archived: boolean;
  revision: number;
};
type Approver = {
  id: string;
  name: string;
  archived: boolean;
  revision: number;
  available_to_all: boolean;
  department_ids: string[];
  can_edit: boolean;
};
type Entry = Category | Approver;
type Catalog = {
  categories: Category[];
  approvers: Approver[];
  venues: { id: string; name: string }[];
  can_manage_global_approvers: boolean;
};
type Kind = "categories" | "approvers";
type Edit = {
  kind: Kind;
  entry?: Entry;
  name: string;
  global: boolean;
  venues: string[];
};

export default function ExpenseCatalog({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const { data, error, loading, refreshing, reload } = useData<Catalog>(
    endpoint,
    true,
  );
  const [kind, setKind] = useState<Kind>("categories");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");

  function openEditor(entry?: Entry) {
    const person = entry && "id" in entry ? entry : null;
    setEdit({
      kind,
      entry,
      name: entry?.name ?? "",
      global: person?.available_to_all ?? false,
      venues: person?.department_ids ?? [],
    });
    setFailure("");
    setNotice("");
  }
  async function write(
    type: Kind,
    entry: Entry | undefined,
    fields: Record<string, unknown>,
  ) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setFailure("");
    setNotice("");
    const key = entry && ("code" in entry ? entry.code : entry.id);
    try {
      await api(
        endpoint + "/" + type + (key ? "/" + encodeURIComponent(key) : ""),
        {
          method: entry ? "PATCH" : "POST",
          body: JSON.stringify(
            entry ? { ...fields, revision: entry.revision } : fields,
          ),
        },
      );
      setEdit(null);
      setNotice(
        entry && fields.archived !== entry.archived
          ? fields.archived
            ? "Запись перенесена в архив."
            : "Запись возвращена из архива."
          : "Изменения сохранены.",
      );
      reload();
    } catch (reason) {
      setFailure(
        reason instanceof Error
          ? reason.message
          : "Не удалось сохранить изменения.",
      );
      if (reason instanceof ApiError && reason.status === 409) reload();
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  function toggleArchive(entry: Entry) {
    const fields = { name: entry.name, archived: !entry.archived };
    void write(
      kind,
      entry,
      "id" in entry
        ? {
            ...fields,
            available_to_all: entry.available_to_all,
            department_ids: entry.department_ids,
          }
        : fields,
    );
  }
  const venueNames = new Map(
    data?.venues.map((venue) => [venue.id, venue.name]),
  );
  const rows =
    data?.[kind].filter((entry) => includeArchived || !entry.archived) ?? [];
  const canSave =
    !!edit?.name.trim() &&
    (edit.kind === "categories" || edit.global || edit.venues.length > 0);
  const original = edit?.entry;
  const current =
    original &&
    data &&
    ("code" in original
      ? data.categories.find((item) => item.code === original.code)
      : data.approvers.find((item) => item.id === original.id));
  const stale = !!current && current.revision !== original?.revision;
  const Heading = standalone ? "h1" : "h2";
  return (
    <Stack gap="md">
      <Heading>Справочники расходов</Heading>
      {error && (
        <Alert color="red" role="alert">
          {error}{" "}
          <Button variant="subtle" type="button" onClick={reload}>
            Повторить
          </Button>
        </Alert>
      )}
      {loading && <Loader size="sm" aria-label="Загрузка справочников" />}
      {data && (
        <Tabs
          value={kind}
          onChange={(tab) => {
            if (tab === "categories" || tab === "approvers") {
              setKind(tab);
              setFailure("");
              setNotice("");
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="categories">Статьи расходов</Tabs.Tab>
            <Tabs.Tab value="approvers">Согласующие</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={kind} pt="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Checkbox
                  label="Показать архивные"
                  checked={includeArchived}
                  onChange={(event) =>
                    setIncludeArchived(event.currentTarget.checked)
                  }
                />
                <Button
                  disabled={busy || refreshing}
                  onClick={() => openEditor()}
                >
                  {kind === "categories"
                    ? "Добавить статью"
                    : "Добавить согласующего"}
                </Button>
              </Group>
              {notice && (
                <Text role="status" size="sm">
                  {notice}
                </Text>
              )}
              {!edit && failure && (
                <Alert role="alert" color="red">
                  {failure}
                </Alert>
              )}
              {rows.length === 0 && (
                <Text c="dimmed">
                  {kind === "categories"
                    ? "Статей расходов пока нет."
                    : "Согласующих пока нет."}
                </Text>
              )}
              <Stack gap="xs">
                {rows.map((entry) => {
                  const person = "id" in entry ? entry : null;
                  return (
                    <Group
                      className="management-card"
                      justify="space-between"
                      key={"code" in entry ? entry.code : entry.id}
                      role="group"
                      aria-label={entry.name}
                    >
                      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                        <Text fw={600}>{entry.name}</Text>
                        {person && (
                          <Text size="sm" c="dimmed">
                            {person.available_to_all
                              ? "Все заведения"
                              : person.department_ids
                                  .map((id) => venueNames.get(id))
                                  .filter(Boolean)
                                  .join(", ")}
                          </Text>
                        )}
                        {entry.archived && (
                          <Text size="sm" c="dimmed">
                            В архиве
                          </Text>
                        )}
                      </div>
                      {(!person || person.can_edit) && (
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            disabled={busy || refreshing}
                            onClick={() => openEditor(entry)}
                          >
                            Изменить
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            disabled={busy || refreshing}
                            onClick={() => toggleArchive(entry)}
                          >
                            {entry.archived ? "Вернуть из архива" : "В архив"}
                          </Button>
                        </Group>
                      )}
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}
      {edit && data && (
        <Modal
          opened
          onClose={() => {
            if (!busy) {
              setEdit(null);
              setFailure("");
            }
          }}
          title={
            edit.kind === "categories"
              ? edit.entry
                ? "Изменить статью"
                : "Добавить статью"
              : edit.entry
                ? "Изменить согласующего"
                : "Добавить согласующего"
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSave || stale) return;
              const fields = {
                name: edit.name.trim(),
                ...(edit.entry ? { archived: edit.entry.archived } : {}),
              };
              void write(
                edit.kind,
                edit.entry,
                edit.kind === "approvers"
                  ? {
                      ...fields,
                      available_to_all: edit.global,
                      department_ids: edit.global ? [] : edit.venues,
                    }
                  : fields,
              );
            }}
          >
            <Stack>
              <TextInput
                label={
                  edit.kind === "categories"
                    ? "Название статьи"
                    : "Имя согласующего"
                }
                required
                maxLength={200}
                value={edit.name}
                disabled={busy}
                onChange={(event) =>
                  setEdit({ ...edit, name: event.currentTarget.value })
                }
              />
              {edit.kind === "approvers" && (
                <>
                  {data.can_manage_global_approvers && (
                    <Checkbox
                      label="Для всех заведений"
                      checked={edit.global}
                      disabled={busy}
                      onChange={(event) =>
                        setEdit({
                          ...edit,
                          global: event.currentTarget.checked,
                        })
                      }
                    />
                  )}
                  {!edit.global && (
                    <MultiSelect
                      label="Заведения"
                      required
                      searchable
                      hidePickedOptions
                      value={edit.venues}
                      disabled={busy}
                      data={data.venues.map((venue) => ({
                        value: venue.id,
                        label: venue.name,
                      }))}
                      onChange={(venues) => setEdit({ ...edit, venues })}
                    />
                  )}
                </>
              )}
              {stale && current && (
                <Alert color="yellow" role="alert">
                  Запись изменена.{" "}
                  <Button
                    variant="subtle"
                    type="button"
                    onClick={() => openEditor(current)}
                  >
                    Загрузить новую версию
                  </Button>
                </Alert>
              )}
              {failure && (
                <Alert role="alert" color="red">
                  {failure}
                </Alert>
              )}
              <Group justify="flex-end">
                <Button
                  type="button"
                  variant="default"
                  disabled={busy}
                  onClick={() => {
                    setEdit(null);
                    setFailure("");
                  }}
                >
                  Закрыть
                </Button>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={!canSave || stale}
                >
                  Сохранить
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      )}
    </Stack>
  );
}

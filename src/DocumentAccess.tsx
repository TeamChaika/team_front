import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "./api";
import { useData } from "./useData";

type PortalAccount = {
  id: string;
  email: string;
  display_name: string;
  sections: string[];
  active: boolean;
};
type AccessGrant = {
  kind: "waybill" | "writeoff";
  store_id: string;
  actions: string[];
};
type Staff = {
  id: number;
  name: string;
  username: string;
  active: boolean;
  telegram_linked: boolean;
  supabase_id: string | null;
  revision: number;
  grants: AccessGrant[];
};
type Directory = { rows: Staff[]; stores: { id: string; name: string }[] };
const actions: Record<string, string> = {
  view: "Просмотр",
  create: "Создание",
  edit: "Изменение",
  cancel: "Отмена",
  approve: "Согласование и отправка",
  copy: "Копирование",
};

function AccessEditor({
  person,
  directory,
  accounts,
  close,
  saved,
}: {
  person: Staff;
  directory: Directory;
  accounts: PortalAccount[];
  close: () => void;
  saved: () => void;
}) {
  const [value, set] = useState(person),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [store, setStore] = useState<string | null>(null),
    [kind, setKind] = useState<string | null>("waybill"),
    [telegram, setTelegram] = useState<string | number>("");
  const account = accounts.find((a) => a.id === value.supabase_id);
  function toggle(index: number, action: string, checked: boolean) {
    set((v) => ({
      ...v,
      grants: v.grants.map((g, i) =>
        i !== index
          ? g
          : {
              ...g,
              actions: checked
                ? [...new Set([...g.actions, "view", action])]
                : action === "view"
                  ? []
                  : g.actions.filter((a) => a !== action),
            },
      ),
    }));
  }
  function addStore() {
    if (!store || (kind !== "waybill" && kind !== "writeoff")) return;
    if (!value.grants.some((g) => g.store_id === store && g.kind === kind))
      set((v) => ({
        ...v,
        grants: [...v.grants, { kind, store_id: store, actions: ["view"] }],
      }));
    setStore(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/documents/admin/staff/${value.id}`, {
        method: "POST",
        body: JSON.stringify({
          revision: value.revision,
          supabase_id: value.supabase_id,
          active: value.active,
          grants: value.grants,
          ...(value.id === 0
            ? {
                name: account?.display_name || value.name,
                ...(telegram !== "" ? { telegram_id: Number(telegram) } : {}),
              }
            : {}),
        }),
      });
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) close();
      }}
      closeOnClickOutside={false}
      closeOnEscape={!busy}
      title={
        value.id
          ? `Рабочие права: ${value.name}`
          : "Подключить нового сотрудника к документам"
      }
      size="xl"
    >
      <form onSubmit={save}>
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Text size="sm" c="dimmed">
            Для сотрудника из старого сайта выберите его существующий профиль в
            списке. Так сохранятся авторство документов и Telegram.
          </Text>
          <Select
            label="Аккаунт dashboard"
            required={!value.id}
            searchable
            clearable
            disabled={busy}
            value={value.supabase_id}
            onChange={(id) => set({ ...value, supabase_id: id })}
            data={accounts
              .filter(
                (a) =>
                  !directory.rows.some(
                    (r) => r.supabase_id === a.id && r.id !== value.id,
                  ),
              )
              .map((a) => ({
                value: a.id,
                label: `${a.display_name} · ${a.email}`,
              }))}
          />
          {value.id === 0 && (
            <NumberInput
              label="Telegram ID сотрудника"
              description="Необязательно. Сотрудник получает свой ID командой /start в существующем боте."
              value={telegram}
              onChange={setTelegram}
              min={1}
              allowDecimal={false}
              allowNegative={false}
              disabled={busy}
            />
          )}
          <Switch
            label="Работа с документами разрешена"
            checked={value.active}
            onChange={(e) => set({ ...value, active: e.currentTarget.checked })}
            disabled={busy}
          />
          {account && !account.active && (
            <Alert color="yellow">
              Вход этого аккаунта dashboard отключён. Рабочие права не включают
              его автоматически.
            </Alert>
          )}
          {account &&
            value.grants.some(
              (g) =>
                !account.sections.includes(
                  g.kind === "waybill" ? "transfers" : "writeoffs",
                ),
            ) && (
              <Alert color="yellow">
                Для выбранных документов сначала включите соответствующий раздел
                меню во вкладке «Сотрудники и доступы».
              </Alert>
            )}
          {value.grants.map((grant, index) => (
            <div
              className="management-card"
              key={`${grant.kind}-${grant.store_id}`}
            >
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600}>
                    {grant.kind === "waybill" ? "Накладные" : "Списания"} ·{" "}
                    {directory.stores.find((s) => s.id === grant.store_id)
                      ?.name || grant.store_id}
                  </Text>
                  <Button
                    size="xs"
                    color="red"
                    variant="subtle"
                    disabled={busy}
                    onClick={() =>
                      set({
                        ...value,
                        grants: value.grants.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Убрать склад
                  </Button>
                </Group>
                <Group>
                  {Object.entries(actions)
                    .filter(
                      ([action]) =>
                        grant.kind === "waybill" ||
                        ["view", "create", "approve"].includes(action),
                    )
                    .map(([action, label]) => (
                      <Checkbox
                        key={action}
                        label={label}
                        checked={grant.actions.includes(action)}
                        disabled={busy}
                        onChange={(e) =>
                          toggle(index, action, e.currentTarget.checked)
                        }
                      />
                    ))}
                </Group>
              </Stack>
            </div>
          ))}
          <Group align="flex-end">
            <Select
              label="Документы"
              value={kind}
              onChange={setKind}
              disabled={busy}
              data={[
                { value: "waybill", label: "Накладные" },
                { value: "writeoff", label: "Списания" },
              ]}
            />
            <Select
              label="Добавить склад"
              searchable
              value={store}
              onChange={setStore}
              disabled={busy}
              data={directory.stores.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
              style={{ flex: 1, minWidth: 200 }}
            />
            <Button
              variant="light"
              disabled={!store || busy}
              onClick={addStore}
            >
              Добавить
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Администратор управляет правами. Отправлять документы в iiko он
            может только при отдельно выданном праве согласования.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={busy} onClick={close}>
              Закрыть
            </Button>
            <Button type="submit" loading={busy}>
              Сохранить рабочие права
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function DocumentAccess({ accounts }: { accounts: PortalAccount[] }) {
  const state = useData<Directory>("/documents/admin/staff");
  const [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Staff | null>(null),
    [notice, setNotice] = useState("");
  return (
    <Stack>
      <Text c="dimmed">
        Привяжите рабочий профиль старого сайта к аккаунту dashboard и назначьте
        действия для каждого склада.
      </Text>
      {notice && (
        <Alert color="teal" withCloseButton onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {state.error && (
        <Alert color="red" role="alert">
          {state.error}
          <Button variant="subtle" onClick={state.reload}>
            Повторить
          </Button>
        </Alert>
      )}
      {state.loading && <Loader />}
      {state.data && (
        <>
          <Group justify="space-between">
            <TextInput
              aria-label="Поиск рабочего профиля"
              placeholder="Имя или логин старого сайта"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <Button
              onClick={() =>
                setEditing({
                  id: 0,
                  name: "",
                  username: "",
                  active: true,
                  supabase_id: null,
                  telegram_linked: false,
                  revision: 0,
                  grants: [],
                })
              }
            >
              Подключить нового сотрудника
            </Button>
          </Group>
          {state.data.rows
            .filter((p) =>
              `${p.name} ${p.username}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((person) => {
              const account = accounts.find((a) => a.id === person.supabase_id);
              return (
                <div className="management-card" key={person.id}>
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600}>{person.name}</Text>
                      <Text size="sm" c="dimmed">
                        {person.username}
                      </Text>
                      <Text size="sm">
                        {account
                          ? account.email
                          : person.supabase_id
                            ? "Аккаунт dashboard связан"
                            : "Аккаунт dashboard ещё не связан"}
                      </Text>
                      <Group gap="xs" mt="xs">
                        <Badge color={person.active ? "teal" : "gray"}>
                          {person.active ? "Работа разрешена" : "Отключён"}
                        </Badge>
                        {person.telegram_linked && (
                          <Badge variant="light">Telegram подключён</Badge>
                        )}
                        <Text size="sm">
                          Назначений складов: {person.grants.length}
                        </Text>
                      </Group>
                    </div>
                    <Button variant="light" onClick={() => setEditing(person)}>
                      Профиль и склады
                    </Button>
                  </Group>
                </div>
              );
            })}
          {editing && (
            <AccessEditor
              person={editing}
              directory={state.data}
              accounts={accounts}
              close={() => setEditing(null)}
              saved={() => {
                setEditing(null);
                setNotice("Рабочие права сохранены.");
                state.reload();
              }}
            />
          )}
        </>
      )}
    </Stack>
  );
}

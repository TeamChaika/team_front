import { useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError } from "./api";
import { useData } from "./useData";
import { CounterpartyPermission } from "./CounterpartyPermission";
import {
  commercialUncertain,
  type CommercialKind,
} from "./commercialInvoiceModel";

type Grant = { kind: CommercialKind; store_id: string; actions: string[] };
type Person = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  supabase_id: string | null;
  revision: number;
  grants: Grant[];
};
type Directory = { users: Person[]; stores: { id: string; name: string }[] };
type Account = {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
  sections: string[];
};
const kindNames: Record<CommercialKind, string> = {
  purchase: "Приходные накладные",
  sale: "Реализация",
};
const actionNames: Record<string, string> = {
  view: "Просмотр",
  create: "Создание",
  edit: "Изменение",
  submit: "Отправка в iiko",
};
const personName = (person: Person) =>
  [person.first_name, person.last_name].filter(Boolean).join(" ") ||
  person.username;
function Editor({
  person,
  directory,
  account,
  close,
  saved,
}: {
  person: Person;
  directory: Directory;
  account?: Account;
  close: () => void;
  saved: () => void;
}) {
  const [grants, setGrants] = useState<Grant[]>(() =>
    person.grants.map((g) => ({ ...g, actions: [...g.actions] })),
  );
  const [kind, setKind] = useState<CommercialKind>("purchase"),
    [store, setStore] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false);
  const pending = useRef<{
    version: number;
    request_id: string;
    grants: Grant[];
  } | null>(null);
  const locked = busy || uncertain || conflict;
  function toggle(index: number, action: string, checked: boolean) {
    setGrants((current) =>
      current.map((g, i) =>
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
    );
  }
  function add() {
    if (!store) return;
    if (!grants.some((g) => g.kind === kind && g.store_id === store))
      setGrants([...grants, { kind, store_id: store, actions: ["view"] }]);
    setStore(null);
  }
  async function save() {
    setError("");
    if (person.revision === undefined) {
      setError("Обновите список прав перед сохранением.");
      return;
    }
    if (!pending.current)
      pending.current = {
        version: person.revision,
        request_id: crypto.randomUUID(),
        grants: grants
          .filter((g) => g.actions.length)
          .map((g) => ({ ...g, actions: [...g.actions] })),
      };
    setBusy(true);
    try {
      await api(`/commercial-invoices/admin/grants/${person.id}`, {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = null;
      saved();
    } catch (e) {
      setError((e as Error).message);
      const unknown = commercialUncertain(e);
      setUncertain(unknown);
      if (!unknown) {
        pending.current = null;
        if (e instanceof ApiError && e.status === 409) setConflict(true);
      }
    } finally {
      setBusy(false);
    }
  }
  const missingSections = [
    ...new Set(
      grants
        .filter(
          (g) =>
            g.actions.length &&
            !account?.sections.includes(
              g.kind === "purchase" ? "invoices" : "outgoing",
            ),
        )
        .map((g) => kindNames[g.kind]),
    ),
  ];
  return (
    <Modal
      opened
      title={`Приход и реализация: ${personName(person)}`}
      size="xl"
      onClose={close}
      closeOnClickOutside={false}
      closeOnEscape={!busy && !uncertain}
      withCloseButton={!busy && !uncertain}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Stack>
          <CounterpartyPermission userId={person.id} />
          {error && <Alert color="red">{error}</Alert>}
          {uncertain && (
            <Alert color="yellow">
              Результат сохранения неизвестен. Повторите тот же запрос.
            </Alert>
          )}
          {conflict && (
            <Alert color="yellow">
              Права изменились после открытия. Закройте форму и обновите список.
            </Alert>
          )}
          {(!person.is_active || !account?.active) && (
            <Alert color="yellow">
              Вход сотрудника отключён или аккаунт dashboard не связан.
              Назначение складов не включает вход.
            </Alert>
          )}
          {missingSections.length > 0 && (
            <Alert color="yellow">
              В «Сотрудники и доступы» включите разделы:{" "}
              {missingSections.join(", ")}.
            </Alert>
          )}
          {grants.map((grant, index) => (
            <div
              className="management-card"
              key={`${grant.kind}-${grant.store_id}`}
            >
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600}>
                    {kindNames[grant.kind]} ·{" "}
                    {directory.stores.find((s) => s.id === grant.store_id)
                      ?.name || grant.store_id}
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    disabled={locked}
                    onClick={() =>
                      setGrants(grants.filter((_, i) => i !== index))
                    }
                  >
                    Убрать склад
                  </Button>
                </Group>
                <Group>
                  {Object.entries(actionNames).map(([action, label]) => (
                    <Checkbox
                      key={action}
                      label={label}
                      checked={grant.actions.includes(action)}
                      disabled={locked}
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
              onChange={(v) => {
                if (v === "purchase" || v === "sale") setKind(v);
              }}
              data={Object.entries(kindNames).map(([value, label]) => ({
                value,
                label,
              }))}
              disabled={locked}
            />
            <Select
              label="Добавить склад"
              searchable
              value={store}
              onChange={setStore}
              data={directory.stores.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
              style={{ flex: 1, minWidth: 200 }}
              disabled={locked}
            />
            <Button variant="light" onClick={add} disabled={locked || !store}>
              Добавить
            </Button>
          </Group>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={close}
              disabled={busy || uncertain}
            >
              Закрыть
            </Button>
            <Button type="submit" loading={busy} disabled={conflict}>
              {uncertain ? "Повторить сохранение" : "Сохранить права"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
export function CommercialInvoiceAccess({ accounts }: { accounts: Account[] }) {
  const state = useData<Directory>("/commercial-invoices/admin/grants");
  const [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Person | null>(null),
    [notice, setNotice] = useState("");
  return (
    <Stack>
      <Text c="dimmed">
        Отдельные права на приходные накладные и реализацию по каждому складу.
      </Text>
      {notice && (
        <Alert color="teal" withCloseButton onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {state.loading && <Loader />}
      {state.error && (
        <Alert color="red">
          {state.error}
          <Button variant="subtle" onClick={state.reload}>
            Повторить
          </Button>
        </Alert>
      )}
      {state.data && (
        <>
          <Group justify="space-between">
            <TextInput
              aria-label="Поиск сотрудника для приходных накладных и реализации"
              placeholder="Имя или логин"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <Button
              variant="default"
              onClick={state.reload}
              disabled={Boolean(editing)}
            >
              Обновить
            </Button>
          </Group>
          {state.data.users
            .filter((person) =>
              `${personName(person)} ${person.username}`
                .toLocaleLowerCase("ru")
                .includes(query.toLocaleLowerCase("ru")),
            )
            .map((person) => {
              const account = accounts.find((a) => a.id === person.supabase_id);
              return (
                <div className="management-card" key={person.id}>
                  <Group justify="space-between">
                    <div>
                      <Text fw={600}>{personName(person)}</Text>
                      <Text size="sm" c="dimmed">
                        {account?.email || person.username}
                      </Text>
                      <Group mt="xs" gap="xs">
                        <Badge color={person.is_active ? "teal" : "gray"}>
                          {person.is_active ? "Активен" : "Отключён"}
                        </Badge>
                        <Text size="sm">
                          Назначений: {person.grants.length}
                        </Text>
                      </Group>
                    </div>
                    <Button variant="light" onClick={() => setEditing(person)}>
                      Права и склады
                    </Button>
                  </Group>
                </div>
              );
            })}
          {!state.data.users.length && (
            <Text c="dimmed">
              Рабочих профилей пока нет. Подключите сотрудника во вкладке
              «Документы и склады».
            </Text>
          )}
          {editing && (
            <Editor
              key={editing.id}
              person={editing}
              directory={state.data}
              account={accounts.find((a) => a.id === editing.supabase_id)}
              close={() => {
                setEditing(null);
                state.reload();
              }}
              saved={() => {
                setEditing(null);
                setNotice(
                  "Права на приходные накладные и реализацию сохранены.",
                );
                state.reload();
              }}
            />
          )}
        </>
      )}
    </Stack>
  );
}

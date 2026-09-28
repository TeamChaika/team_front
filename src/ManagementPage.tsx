import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  PasswordInput,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBuildingStore, IconPlus, IconUsers } from "@tabler/icons-react";
import { api } from "./api";

type Grant = { venue: string; can_create: boolean };
type Account = {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
  is_portal_admin?: boolean;
  sections: string[];
  all_departments: boolean;
  department_ids: string[];
  deposits_all: boolean;
  deposits_create: boolean;
  deposit_grants: Grant[];
  revision?: number;
};
type Directory = {
  users: Account[];
  sections: { id: string; title: string }[];
  departments: { id: string; name: string }[];
  venues: string[];
};
type Venue = {
  id: string;
  name: string;
  active: boolean;
  revision?: number;
  default_terminal_id?: string | null;
};
type Terminal = {
  id: string;
  venue_id: string;
  name: string;
  qrt_uuid: string | null;
  active: boolean;
  revision?: number;
  key_configured?: boolean;
};
type Configuration = { venues: Venue[]; terminals: Terminal[] };
const emptyAccount = (): Account => ({
  id: crypto.randomUUID(),
  email: "",
  display_name: "",
  active: true,
  sections: [],
  all_departments: false,
  department_ids: [],
  deposits_all: false,
  deposits_create: false,
  deposit_grants: [],
});

function AccountEditor({
  account,
  directory,
  close,
  saved,
}: {
  account: Account;
  directory: Directory;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [value, set] = useState(account),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const creating = account.revision === undefined;
  const iiko = value.sections.some((s) => s !== "deposits");
  const deposits = value.sections.includes("deposits");
  function section(id: string, checked: boolean) {
    set((v) => ({
      ...v,
      sections: checked
        ? [...v.sections, id]
        : v.sections.filter((x) => x !== id),
      ...(id === "deposits" && !checked
        ? { deposits_all: false, deposits_create: false, deposit_grants: [] }
        : {}),
    }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      display_name: value.display_name,
      active: value.active,
      sections: value.sections,
      all_departments: iiko && value.all_departments,
      department_ids:
        iiko && !value.all_departments ? value.department_ids : [],
      deposits_all: deposits && value.deposits_all,
      deposits_create: deposits && value.deposits_all && value.deposits_create,
      deposit_grants:
        deposits && !value.deposits_all ? value.deposit_grants : [],
    };
    try {
      await api(
        creating ? "/management/accounts" : `/management/accounts/${value.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...body,
            ...(creating
              ? { email: value.email, password, request_id: value.id }
              : { revision: value.revision }),
          }),
        },
      );
      setPassword("");
      await saved();
      close();
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
      title={creating ? "Новый сотрудник" : "Права сотрудника"}
      size="xl"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      <form onSubmit={save}>
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Имя сотрудника"
              value={value.display_name}
              onChange={(e) =>
                set({ ...value, display_name: e.currentTarget.value })
              }
              required
              maxLength={150}
            />
            <TextInput
              label="Почта для входа"
              type="email"
              value={value.email}
              disabled={!creating}
              onChange={(e) => set({ ...value, email: e.currentTarget.value })}
              required
              maxLength={254}
            />
          </SimpleGrid>
          {creating && (
            <PasswordInput
              label="Пароль для входа"
              description="От 12 до 128 символов. Передайте сотруднику почту и пароль; письмо автоматически не отправляется."
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          )}
          {!creating && (
            <Switch
              label="Вход сотрудника включён"
              checked={value.active}
              disabled={value.is_portal_admin}
              onChange={(e) =>
                set({ ...value, active: e.currentTarget.checked })
              }
            />
          )}
          <div>
            <Text fw={600} mb="sm">
              Доступные разделы меню
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {directory.sections.map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.title}
                  checked={value.sections.includes(s.id)}
                  onChange={(e) => section(s.id, e.currentTarget.checked)}
                />
              ))}
            </SimpleGrid>
          </div>
          {iiko && (
            <Stack gap="sm">
              <Text fw={600}>Заведения iiko</Text>
              <Text size="sm" c="dimmed">
                Выбранные заведения доступны во всех разрешённых разделах iiko.
              </Text>
              <Checkbox
                label="Все заведения iiko, включая новые"
                checked={value.all_departments}
                onChange={(e) =>
                  set({ ...value, all_departments: e.currentTarget.checked })
                }
              />
              {!value.all_departments && (
                <MultiSelect
                  label="Разрешённые заведения iiko"
                  data={directory.departments.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  value={value.department_ids}
                  onChange={(department_ids) =>
                    set({ ...value, department_ids })
                  }
                  searchable
                  required
                />
              )}
            </Stack>
          )}
          {deposits && (
            <Stack gap="sm">
              <Text fw={600}>Права на депозиты</Text>
              <Checkbox
                label="Просмотр всех заведений, включая новые"
                checked={value.deposits_all}
                onChange={(e) =>
                  set({
                    ...value,
                    deposits_all: e.currentTarget.checked,
                    deposits_create: false,
                  })
                }
              />
              {value.deposits_all ? (
                <Checkbox
                  label="Создание депозитов во всех заведениях"
                  checked={value.deposits_create}
                  onChange={(e) =>
                    set({ ...value, deposits_create: e.currentTarget.checked })
                  }
                />
              ) : (
                <>
                  <MultiSelect
                    label="Заведения для просмотра депозитов"
                    data={directory.venues}
                    value={value.deposit_grants.map((g) => g.venue)}
                    onChange={(names) =>
                      set({
                        ...value,
                        deposit_grants: names.map(
                          (venue) =>
                            value.deposit_grants.find(
                              (g) => g.venue === venue,
                            ) ?? { venue, can_create: false },
                        ),
                      })
                    }
                    searchable
                  />
                  {value.deposit_grants.map((g) => (
                    <Checkbox
                      key={g.venue}
                      label={`Создание депозитов: ${g.venue}`}
                      checked={g.can_create}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        set({
                          ...value,
                          deposit_grants: value.deposit_grants.map((x) =>
                            x.venue === g.venue
                              ? { ...x, can_create: checked }
                              : x,
                          ),
                        });
                      }}
                    />
                  ))}
                </>
              )}
            </Stack>
          )}
          {value.sections.length === 0 && (
            <Alert color="yellow">
              Сотрудник сможет войти, но рабочие разделы пока будут недоступны.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" loading={busy}>
              {creating ? "Создать сотрудника" : "Сохранить права"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function VenueEditor({
  venue,
  close,
  saved,
}: {
  venue: Venue;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [value, set] = useState(venue),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) close();
      }}
      title={venue.revision ? "Редактировать заведение" : "Новое заведение"}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(`/management/venues/${value.id}`, {
              method: "POST",
              body: JSON.stringify({
                name: value.name,
                active: value.active,
                revision: value.revision,
              }),
            });
            await saved();
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Название заведения"
            value={value.name}
            onChange={(e) => set({ ...value, name: e.currentTarget.value })}
            required
            maxLength={100}
          />
          <Switch
            label="Доступно для новых депозитов"
            checked={value.active}
            onChange={(e) => set({ ...value, active: e.currentTarget.checked })}
          />
          <Text size="sm" c="dimmed">
            Для создания депозитов нужен выбранный терминал. Отключение
            заведения не отменяет ранее выданные гостям ссылки.
          </Text>
          <Button type="submit" loading={busy}>
            Сохранить заведение
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

function TerminalEditor({
  terminal,
  venue,
  close,
  saved,
}: {
  terminal: Terminal;
  venue: Venue;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [value, set] = useState(terminal),
    [key, setKey] = useState(""),
    [selected, setSelected] = useState(
      venue.default_terminal_id === terminal.id || !venue.default_terminal_id,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = venue.default_terminal_id === terminal.id;
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) close();
      }}
      title={`${terminal.revision ? "Редактировать" : "Новый"} терминал · ${venue.name}`}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(`/management/venues/${venue.id}/terminals/${value.id}`, {
              method: "POST",
              body: JSON.stringify({
                name: value.name,
                qrt_uuid: value.qrt_uuid || null,
                active: value.active,
                make_default: selected,
                revision: value.revision,
                ...(key ? { api_key: key } : {}),
              }),
            });
            setKey("");
            await saved();
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Название терминала"
            value={value.name}
            onChange={(e) => set({ ...value, name: e.currentTarget.value })}
            required
            maxLength={100}
          />
          <TextInput
            label="UUID терминала QR Manager"
            description="Необязательно. Используется для учёта; платёжный терминал определяется API-ключом."
            value={value.qrt_uuid ?? ""}
            onChange={(e) => set({ ...value, qrt_uuid: e.currentTarget.value })}
            maxLength={36}
          />
          <PasswordInput
            label={terminal.revision ? "Новый API-ключ" : "API-ключ QR Manager"}
            description={
              terminal.revision
                ? "Оставьте пустым, чтобы сохранить текущий ключ."
                : "Ключ хранится на сервере и не показывается после сохранения."
            }
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            required={!terminal.revision}
            minLength={8}
            maxLength={512}
            autoComplete="new-password"
          />
          <Switch
            label="Терминал включён"
            checked={value.active}
            disabled={current}
            onChange={(e) => {
              const active = e.currentTarget.checked;
              set({ ...value, active });
              if (!active) setSelected(false);
            }}
          />
          <Checkbox
            label="Принимать новые платежи через этот терминал"
            checked={selected}
            disabled={current || !value.active}
            onChange={(e) => setSelected(e.currentTarget.checked)}
          />
          <Text size="sm" c="dimmed">
            Выбор применяется при выпуске нового QR. Уже выпущенные QR остаются
            привязаны к прежним операциям.
          </Text>
          <Button type="submit" loading={busy}>
            Сохранить терминал
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

export function ManagementPage({
  onChange,
  documentsEnabled: _documentsEnabled,
}: {
  onChange: () => void;
  documentsEnabled?: boolean;
}) {
  const [directory, setDirectory] = useState<Directory | null>(null),
    [configuration, setConfiguration] = useState<Configuration | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [account, setAccount] = useState<Account | null>(null),
    [venue, setVenue] = useState<Venue | null>(null),
    [terminal, setTerminal] = useState<Terminal | null>(null),
    [query, setQuery] = useState("");
  async function load() {
    const [a, v] = await Promise.all([
      api<Directory>("/management/accounts"),
      api<Configuration>("/management/venues"),
    ]);
    setDirectory(a);
    setConfiguration(v);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function saved() {
    setNotice("Изменения сохранены.");
    await load();
    onChange();
  }
  const parent =
    terminal && configuration?.venues.find((v) => v.id === terminal.venue_id);
  return (
    <Stack>
      <div>
        <h1>Управление</h1>
        <Text c="dimmed">
          Учётные записи dashboard, права по разделам и приём депозитов.
        </Text>
      </div>
      {error && (
        <Alert color="red" role="alert">
          {error}
          <Button
            variant="subtle"
            onClick={() => {
              setError("");
              load().catch((e) => setError(e.message));
            }}
          >
            Повторить
          </Button>
        </Alert>
      )}
      {notice && (
        <Alert color="green" withCloseButton onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {!directory || !configuration ? (
        <Loader />
      ) : (
        <Tabs defaultValue="accounts">
          <Tabs.List>
            <Tabs.Tab value="accounts" leftSection={<IconUsers size={17} />}>
              Сотрудники и доступы
            </Tabs.Tab>
            <Tabs.Tab
              value="venues"
              leftSection={<IconBuildingStore size={17} />}
            >
              Заведения и терминалы
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="accounts" pt="lg">
            <Stack>
              <Group justify="space-between">
                <TextInput
                  aria-label="Поиск сотрудника"
                  placeholder="Имя или почта"
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                />
                <Button
                  leftSection={<IconPlus size={17} />}
                  onClick={() => setAccount(emptyAccount())}
                >
                  Создать сотрудника
                </Button>
              </Group>
              {directory.users
                .filter((u) =>
                  (u.display_name + " " + u.email)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((u) => (
                  <div key={u.id} className="management-card">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text fw={600}>{u.display_name}</Text>
                        <Text size="sm" c="dimmed">
                          {u.email}
                        </Text>
                        <Group gap="xs" mt="xs">
                          <Badge color={u.active ? "teal" : "gray"}>
                            {u.active ? "Вход включён" : "Вход отключён"}
                          </Badge>
                          {u.is_portal_admin && (
                            <Badge color="violet">Администратор</Badge>
                          )}
                          <Text size="sm">Разделов: {u.sections.length}</Text>
                        </Group>
                      </div>
                      <Button variant="light" onClick={() => setAccount(u)}>
                        Изменить права
                      </Button>
                    </Group>
                  </div>
                ))}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="venues" pt="lg">
            <Stack>
              <Group justify="space-between">
                <Text c="dimmed">
                  Для каждого заведения выбирается один терминал для оплаты.
                </Text>
                <Button
                  leftSection={<IconPlus size={17} />}
                  onClick={() =>
                    setVenue({
                      id: crypto.randomUUID(),
                      name: "",
                      active: true,
                    })
                  }
                >
                  Создать заведение
                </Button>
              </Group>
              {configuration.venues.map((v) => (
                <div className="management-card" key={v.id}>
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Group>
                        <Text fw={600}>{v.name}</Text>
                        <Badge color={v.active ? "teal" : "gray"}>
                          {v.active ? "Включено" : "Отключено"}
                        </Badge>
                      </Group>
                      <Button variant="subtle" onClick={() => setVenue(v)}>
                        Редактировать заведение
                      </Button>
                    </Group>
                    {!v.default_terminal_id && (
                      <Alert color="yellow">
                        Добавьте и выберите терминал для приёма оплаты.
                      </Alert>
                    )}
                    {configuration.terminals
                      .filter((t) => t.venue_id === v.id)
                      .map((t) => (
                        <Group
                          key={t.id}
                          justify="space-between"
                          className="management-terminal"
                        >
                          <div>
                            <Group gap="xs">
                              <Text size="sm" fw={600}>
                                {t.name}
                              </Text>
                              {v.default_terminal_id === t.id ? (
                                <Badge color="blue">Принимает оплату</Badge>
                              ) : (
                                <Badge color="gray">
                                  {t.active ? "Резервный" : "Отключён"}
                                </Badge>
                              )}
                            </Group>
                            <Text size="xs" c="dimmed">
                              {t.qrt_uuid || "UUID не указан"} ·{" "}
                              {t.key_configured
                                ? "Ключ сохранён"
                                : "Ключ не задан"}
                            </Text>
                          </div>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => setTerminal(t)}
                          >
                            Настроить терминал
                          </Button>
                        </Group>
                      ))}
                    <Button
                      variant="default"
                      onClick={() =>
                        setTerminal({
                          id: crypto.randomUUID(),
                          venue_id: v.id,
                          name: "",
                          qrt_uuid: null,
                          active: true,
                        })
                      }
                    >
                      Добавить терминал
                    </Button>
                  </Stack>
                </div>
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}
      {account && directory && (
        <AccountEditor
          key={account.id}
          account={account}
          directory={directory}
          close={() => setAccount(null)}
          saved={saved}
        />
      )}
      {venue && (
        <VenueEditor
          key={venue.id}
          venue={venue}
          close={() => setVenue(null)}
          saved={saved}
        />
      )}
      {terminal && parent && (
        <TerminalEditor
          key={terminal.id}
          terminal={terminal}
          venue={parent}
          close={() => setTerminal(null)}
          saved={saved}
        />
      )}
    </Stack>
  );
}

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";
import { useWorkspace } from "./App";
import { useData } from "./useData";

type Fields = {
  name: string;
  code: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  phone: string;
  cell_phone: string;
  email: string;
  main_role_code: string;
  role_codes: string[] | null;
  department_codes: string[] | null;
  preferred_department_code: string;
};
type Options = {
  roles: { code: string; name: string }[];
  departments: { code: string; name: string }[];
};
type Card = { id: string; version: string; fields: Fields };
type Command = {
  request_id: string;
  version?: string;
  fields: Partial<Fields>;
};
const empty: Fields = {
  name: "",
  code: "",
  first_name: "",
  last_name: "",
  middle_name: "",
  phone: "",
  cell_phone: "",
  email: "",
  main_role_code: "",
  role_codes: [],
  department_codes: [],
  preferred_department_code: "",
};

export function EmployeeEditor({
  id,
  onSaved,
}: {
  id?: string;
  onSaved?: () => void;
}) {
  const w = useWorkspace(),
    navigate = useNavigate();
  const [opened, setOpened] = useState(false),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [options, setOptions] = useState<Options | null>(null);
  const [card, setCard] = useState<Card | null>(null),
    [values, setValues] = useState<Fields>(empty);
  const [submitted, setSubmitted] = useState<Command | null>(null),
    [saved, setSaved] = useState(false);
  if (w.meta.user.role !== "owner") return null;
  async function open() {
    setOpened(true);
    setLoading(true);
    setError("");
    setSaved(false);
    setSubmitted(null);
    setOptions(null);
    try {
      const data = await api<Options>("/employees/options");
      const next = id
        ? await api<Card>(`/employees/${id}/edit?${w.query()}`)
        : null;
      setOptions(data);
      setCard(next);
      const normalized = { ...empty, ...next?.fields };
      for (const key of Object.keys(empty) as (keyof Fields)[]) {
        if (
          key !== "role_codes" &&
          key !== "department_codes" &&
          normalized[key] == null
        )
          (normalized as unknown as Record<string, unknown>)[key] = "";
      }
      setValues(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть карточку.");
    } finally {
      setLoading(false);
    }
  }
  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setValues((old) => ({ ...old, [key]: value }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const changed: Partial<Fields> = {};
    for (const key of Object.keys(empty) as (keyof Fields)[]) {
      const old = card?.fields[key] ?? (Array.isArray(values[key]) ? [] : "");
      if (!id || JSON.stringify(values[key]) !== JSON.stringify(old)) {
        if (values[key] !== null)
          (changed as Record<string, unknown>)[key] = values[key];
      }
    }
    if (!submitted && Object.keys(changed).length === 0) {
      setError("Изменений нет.");
      return;
    }
    const command = submitted ?? {
      request_id: crypto.randomUUID(),
      version: card?.version,
      fields: changed,
    };
    setSubmitted(command);
    setSaving(true);
    try {
      const result = await api<{ id: string; status: string }>(
        id ? `/employees/${id}?${w.query()}` : "/employees",
        { method: "POST", body: JSON.stringify(command) },
      );
      setSubmitted(null);
      setSaved(true);
      setOpened(false);
      w.setDepartment("");
      onSaved?.();
      navigate(`/employees/${result.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить сотрудника.",
      );
      window.dispatchEvent(new Event("employee-save-finished"));
      // Keep exactly the same command after a network/ambiguous outcome. The backend only reads it back.
      if (e instanceof ApiError && e.status < 500 && !e.employeePending)
        setSubmitted(null);
    } finally {
      setSaving(false);
    }
  }
  const listOptions = (
    items: { code: string; name: string }[],
    selected: string[],
  ) => {
    const unique = new Map(
      items
        .filter((x) => x.code)
        .map((x) => [x.code, { value: x.code, label: x.name }]),
    );
    selected.filter(Boolean).forEach((code) => {
      if (!unique.has(code))
        unique.set(code, { value: code, label: `${code} · из iiko` });
    });
    return [...unique.values()];
  };
  return (
    <>
      <Button
        variant={id ? "light" : "filled"}
        leftSection={id ? <IconPencil size={16} /> : <IconPlus size={16} />}
        onClick={open}
      >
        {id ? "Редактировать" : "Добавить сотрудника"}
      </Button>
      {saved && (
        <Text size="sm" c="teal" role="status">
          Сохранено в iiko и обновлено на сайте.
        </Text>
      )}
      <Modal
        opened={opened}
        onClose={() => {
          if (!saving) setOpened(false);
        }}
        closeOnClickOutside={!saving && !submitted}
        closeOnEscape={!saving}
        title={id ? "Редактирование сотрудника" : "Новый сотрудник"}
        size="lg"
      >
        {loading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text>Загружаем карточку из iiko…</Text>
          </Group>
        ) : (
          <form onSubmit={save}>
            <Stack gap="sm">
              {error && (
                <Alert color="red" role="alert">
                  {error}
                </Alert>
              )}
              {options && (
                <>
                  <fieldset
                    disabled={saving || !!submitted}
                    style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                  >
                    <Stack gap="sm">
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <TextInput
                          label="Имя в iiko"
                          required
                          maxLength={200}
                          value={values.name}
                          onChange={(e) => set("name", e.currentTarget.value)}
                        />
                        <TextInput
                          label="Табельный номер"
                          required
                          maxLength={100}
                          value={values.code}
                          onChange={(e) => set("code", e.currentTarget.value)}
                        />
                      </SimpleGrid>
                      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                        {(
                          [
                            ["last_name", "Фамилия"],
                            ["first_name", "Имя"],
                            ["middle_name", "Отчество"],
                          ] as const
                        ).map(([key, label]) => (
                          <TextInput
                            key={key}
                            label={label}
                            maxLength={200}
                            value={values[key]}
                            onChange={(e) => set(key, e.currentTarget.value)}
                          />
                        ))}
                      </SimpleGrid>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <TextInput
                          label="Мобильный телефон"
                          type="tel"
                          maxLength={200}
                          value={values.cell_phone}
                          onChange={(e) =>
                            set("cell_phone", e.currentTarget.value)
                          }
                        />
                        <TextInput
                          label="Email"
                          type="email"
                          maxLength={200}
                          value={values.email}
                          onChange={(e) => set("email", e.currentTarget.value)}
                        />
                      </SimpleGrid>
                      <MultiSelect
                        label="Должности"
                        required
                        searchable
                        hidePickedOptions
                        data={listOptions(
                          options.roles,
                          values.role_codes ?? [],
                        )}
                        value={values.role_codes?.filter(Boolean) ?? []}
                        onChange={(v) => set("role_codes", v)}
                        disabled={saving || !!submitted}
                      />
                      <Select
                        label="Основная должность"
                        required
                        searchable
                        data={listOptions(
                          options.roles,
                          values.role_codes ?? [],
                        ).filter((r) => values.role_codes?.includes(r.value))}
                        value={values.main_role_code || null}
                        onChange={(v) => set("main_role_code", v ?? "")}
                        disabled={saving || !!submitted}
                      />
                      <MultiSelect
                        label="Заведения"
                        required={!id}
                        searchable
                        hidePickedOptions
                        placeholder={
                          values.department_codes === null
                            ? "Заведения не заданы списком"
                            : "Выберите заведения"
                        }
                        data={listOptions(
                          options.departments,
                          values.department_codes ?? [],
                        )}
                        value={values.department_codes?.filter(Boolean) ?? []}
                        onChange={(v) => set("department_codes", v)}
                        disabled={saving || !!submitted}
                      />
                      <Select
                        label="Основное заведение"
                        clearable
                        searchable
                        data={listOptions(options.departments, [
                          values.preferred_department_code,
                        ]).filter(
                          (d) =>
                            values.department_codes === null ||
                            values.department_codes?.includes(d.value),
                        )}
                        value={values.preferred_department_code || null}
                        onChange={(v) =>
                          set("preferred_department_code", v ?? "")
                        }
                        disabled={saving || !!submitted}
                      />
                    </Stack>
                  </fieldset>
                  <Text size="xs" c="dimmed">
                    Изменения сохраняются в iiko и затем обновляются на сайте.
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      variant="subtle"
                      onClick={() => setOpened(false)}
                      disabled={saving}
                    >
                      Закрыть
                    </Button>
                    <Button type="submit" loading={saving}>
                      {submitted ? "Проверить сохранение" : "Сохранить в iiko"}
                    </Button>
                  </Group>
                </>
              )}
              {!options && (
                <Button variant="light" onClick={open}>
                  Повторить загрузку
                </Button>
              )}
            </Stack>
          </form>
        )}
      </Modal>
    </>
  );
}

export function EmployeePending() {
  const w = useWorkspace(),
    navigate = useNavigate();
  const pending = useData<
    { id: string; employee_id: string; name: string | null }[]
  >(w.meta.user.role === "owner" ? "/employees/pending" : null);
  const [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => pending.reload();
    window.addEventListener("employee-save-finished", refresh);
    return () => window.removeEventListener("employee-save-finished", refresh);
  }, [pending.reload]);
  async function refresh(id: string) {
    setBusy(id);
    setMessage("");
    try {
      const result = await api<{ id: string; status: string }>(
        `/employees/changes/${id}/refresh`,
        { method: "POST" },
      );
      w.setDepartment("");
      pending.reload();
      if (result.status === "reconciled")
        setMessage(
          "Загружены текущие данные iiko. Часть ранее отправленных изменений не подтвердилась.",
        );
      else navigate(`/employees/${result.id}`);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Не удалось проверить сохранение.",
      );
    } finally {
      setBusy("");
    }
  }
  if (!pending.data?.length && !message) return null;
  return (
    <Alert color="yellow" mb="md">
      <Stack gap="xs">
        {message && (
          <Text size="sm" role="status">
            {message}
          </Text>
        )}
        {pending.data?.map((row) => (
          <Group key={row.id} justify="space-between">
            <Text size="sm">
              Неподтверждённое сохранение · {row.name || "Сотрудник"}
            </Text>
            <Button
              size="xs"
              variant="light"
              loading={busy === row.id}
              disabled={!!busy}
              onClick={() => refresh(row.id)}
            >
              Загрузить текущие данные iiko
            </Button>
          </Group>
        ))}
      </Stack>
    </Alert>
  );
}

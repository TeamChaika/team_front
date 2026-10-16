import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError } from "./api";
import {
  operationSettingsPayload,
  scopeIncludes,
  scopeModeIds,
  toggleScope,
  type OperationSettings as Settings,
  type ScopeMode,
} from "./operationSettingsModel";

const modes = [
  { value: "all", label: "Все, включая новые" },
  { value: "selected", label: "Только выбранные" },
];
export function OperationSettings({ onChange }: { onChange: () => void }) {
  const [value, setValue] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [conflict, setConflict] = useState(false),
    [dirty, setDirty] = useState(false);
  const [departmentQuery, setDepartmentQuery] = useState(""),
    [storeQuery, setStoreQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  async function load() {
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const result = await api<Settings>("/management/operation-settings", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setValue(result);
      setConflict(false);
      setDirty(false);
      setNotice("");
    } catch (reason) {
      if (controller.signal.aborted) return;
      setLoadFailed(true);
      setError((reason as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => loadRequest.current?.abort();
  }, []);
  function update(next: Settings) {
    setValue(next);
    setDirty(true);
    setNotice("");
  }
  async function save() {
    if (!value) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<Settings>("/management/operation-settings", {
        method: "POST",
        body: JSON.stringify(operationSettingsPayload(value)),
      });
      setValue(result);
      setDirty(false);
      setConflict(false);
      setNotice("Настройки сохранены.");
      onChange();
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setConflict(stale);
      setError(
        stale
          ? "Настройки изменены другим пользователем. Ваши изменения сохранены в форме. Обновите данные перед повторным сохранением."
          : (reason as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const disabled = loading || busy;
  if (!value)
    return (
      <Stack>
        {error && (
          <Alert color="red" role="alert">
            {error}
            <Button
              variant="subtle"
              disabled={loading}
              onClick={() => void load()}
            >
              Повторить
            </Button>
          </Alert>
        )}
        {loading && <Loader />}
      </Stack>
    );
  const departments = value.departments.filter((d) =>
    d.name.toLocaleLowerCase().includes(departmentQuery.toLocaleLowerCase()),
  );
  const stores = value.stores.filter(
    (s) =>
      (s.name + " " + (s.department_name || ""))
        .toLocaleLowerCase()
        .includes(storeQuery.toLocaleLowerCase()) &&
      (!departmentFilter ||
        (s.department_id || s.parent_id) === departmentFilter),
  );
  function setMode(key: "sync" | "writeoff" | "waybill", mode: ScopeMode) {
    if (key === "sync")
      update({
        ...value!,
        sync: {
          mode,
          department_ids: scopeModeIds(
            value!.sync.mode,
            value!.sync.department_ids,
            value!.departments.map((d) => d.id),
            mode,
          ),
        },
      });
    else
      update({
        ...value!,
        [key]: {
          mode,
          store_ids: scopeModeIds(
            value![key].mode,
            value![key].store_ids,
            value!.stores.map((s) => s.id),
            mode,
          ),
        },
      });
  }
  return (
    <Stack>
      {error && (
        <Alert color="red" role="alert">
          {error}
          {conflict && (
            <Button
              variant="subtle"
              disabled={disabled}
              onClick={() => void load()}
            >
              Обновить и сбросить изменения
            </Button>
          )}
          {loadFailed && !conflict && loading === false && (
            <Button
              variant="subtle"
              disabled={disabled}
              onClick={() => void load()}
            >
              Повторить загрузку
            </Button>
          )}
        </Alert>
      )}
      {notice && (
        <Alert color="green" role="status">
          {notice}
        </Alert>
      )}
      <fieldset
        disabled={disabled}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <Stack>
          <Text component="h2" size="lg" fw={600}>
            Синхронизация заведений
          </Text>
          <Text size="sm" c="dimmed">
            Выключенное заведение перестаёт обновляться во всех разделах.
            История сохраняется.
          </Text>
          <Select
            label="Заведения"
            data={modes}
            value={value.sync.mode}
            onChange={(mode) => mode && setMode("sync", mode as ScopeMode)}
          />
          <TextInput
            label="Поиск заведения"
            value={departmentQuery}
            onChange={(e) => setDepartmentQuery(e.currentTarget.value)}
          />
          <Group>
            <Button
              variant="subtle"
              onClick={() =>
                update({
                  ...value,
                  sync: {
                    mode: "selected",
                    department_ids: value.departments.map((d) => d.id),
                  },
                })
              }
            >
              Выбрать все текущие
            </Button>
            <Button
              variant="subtle"
              onClick={() =>
                update({
                  ...value,
                  sync: { mode: "selected", department_ids: [] },
                })
              }
            >
              Снять все
            </Button>
          </Group>
          {departments.map((d) => (
            <Checkbox
              key={d.id}
              label={d.name}
              checked={scopeIncludes(
                value.sync.mode,
                value.sync.department_ids,
                d.id,
              )}
              onChange={(e) => {
                const next = toggleScope(
                  value.sync.mode,
                  value.sync.department_ids,
                  value.departments.map((d) => d.id),
                  d.id,
                  e.currentTarget.checked,
                );
                update({
                  ...value,
                  sync: { mode: next.mode, department_ids: next.ids },
                });
              }}
            />
          ))}
          {!departments.length && <Text c="dimmed">Заведения не найдены.</Text>}
          {value.sync.mode === "selected" && (
            <Text size="sm">
              Выбрано заведений: {value.sync.department_ids.length}
            </Text>
          )}
          <Text component="h2" size="lg" fw={600}>
            Склады для новых документов и копий
          </Text>
          <Group grow align="end">
            {(["writeoff", "waybill"] as const).map((key) => (
              <Select
                key={key}
                label={key === "writeoff" ? "Списания" : "Перемещения"}
                data={modes}
                value={value[key].mode}
                onChange={(mode) => mode && setMode(key, mode as ScopeMode)}
              />
            ))}
          </Group>
          <Group grow align="end">
            <TextInput
              label="Поиск склада"
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.currentTarget.value)}
            />
            <Select
              label="Заведение"
              clearable
              searchable
              data={value.departments.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              value={departmentFilter}
              onChange={setDepartmentFilter}
            />
          </Group>
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Склад</Table.Th>
                  <Table.Th>Заведение</Table.Th>
                  <Table.Th>Списания</Table.Th>
                  <Table.Th>Перемещения</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stores.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>{s.name}</Table.Td>
                    <Table.Td>
                      {s.department_name ||
                        value.departments.find(
                          (d) => d.id === (s.department_id || s.parent_id),
                        )?.name ||
                        "—"}
                    </Table.Td>
                    {(["writeoff", "waybill"] as const).map((key) => (
                      <Table.Td key={key}>
                        <Checkbox
                          aria-label={`${key === "writeoff" ? "Списания" : "Перемещения"}: ${s.name}`}
                          checked={scopeIncludes(
                            value[key].mode,
                            value[key].store_ids,
                            s.id,
                          )}
                          onChange={(e) => {
                            const next = toggleScope(
                              value[key].mode,
                              value[key].store_ids,
                              value.stores.map((s) => s.id),
                              s.id,
                              e.currentTarget.checked,
                            );
                            update({
                              ...value,
                              [key]: { mode: next.mode, store_ids: next.ids },
                            });
                          }}
                        />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!stores.length && <Text c="dimmed">Склады не найдены.</Text>}
          <Text size="sm">
            Списания:{" "}
            {value.writeoff.mode === "all"
              ? "все"
              : value.writeoff.store_ids.length}
            . Перемещения:{" "}
            {value.waybill.mode === "all"
              ? "все"
              : value.waybill.store_ids.length}
            .
          </Text>
        </Stack>
      </fieldset>
      <Group>
        <Button
          disabled={disabled || !dirty || conflict}
          loading={busy}
          onClick={() => void save()}
        >
          Сохранить
        </Button>
        <Button
          variant="default"
          disabled={disabled || !dirty}
          onClick={() => void load()}
        >
          Сбросить изменения
        </Button>
      </Group>
    </Stack>
  );
}

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api, ApiError } from "./api";
import {
  venueArchivePayload,
  type VenueArchive as Settings,
} from "./venueArchiveModel";

export function VenueArchive({ onChange }: { onChange: () => void }) {
  const [value, setValue] = useState<Settings | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const result = await api<Settings>("/management/venue-archives", {
        signal,
      });
      if (signal?.aborted) return;
      setValue(result);
      setDirty(false);
      setConflict(false);
      setNotice("");
    } catch (reason) {
      if (!signal?.aborted) setError((reason as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);
  async function save() {
    if (!value) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<Settings>("/management/venue-archives", {
        method: "POST",
        body: JSON.stringify(venueArchivePayload(value)),
      });
      setValue(result);
      setDirty(false);
      setNotice("Сохранено");
      onChange();
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setConflict(stale);
      setError(
        stale
          ? "Список изменился. Обновите данные перед сохранением."
          : (reason as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const disabled = loading || busy;
  const matches =
    value?.departments.filter((venue) =>
      venue.name
        .toLocaleLowerCase("ru")
        .includes(search.trim().toLocaleLowerCase("ru")),
    ) ?? [];
  return (
    <Stack>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {notice && <Alert color="green">{notice}</Alert>}
      {loading && <Loader />}
      {value && (
        <>
          <TextInput
            placeholder="Найти заведение"
            aria-label="Поиск заведений"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          {matches.map((venue) => {
            const archived = value.archived_department_ids.includes(venue.id);
            return (
              <Group
                key={venue.id}
                justify="space-between"
                className="management-card"
              >
                <Group gap="xs">
                  <Text fw={500}>{venue.name}</Text>
                  <Badge color={archived ? "gray" : "teal"}>
                    {archived ? "В архиве" : "Активно"}
                  </Badge>
                </Group>
                <Button
                  size="xs"
                  variant="default"
                  disabled={disabled}
                  aria-label={`${archived ? "Вернуть из архива" : "В архив"}: ${venue.name}`}
                  onClick={() => {
                    setValue({
                      ...value,
                      archived_department_ids: archived
                        ? value.archived_department_ids.filter(
                            (id) => id !== venue.id,
                          )
                        : [...value.archived_department_ids, venue.id],
                    });
                    setDirty(true);
                    setNotice("");
                  }}
                >
                  {archived ? "Вернуть" : "В архив"}
                </Button>
              </Group>
            );
          })}
          {!matches.length && <Text c="dimmed">Заведения не найдены</Text>}
        </>
      )}
      <Group>
        {value && (
          <Button
            loading={busy}
            disabled={disabled || !dirty || conflict}
            onClick={() => void save()}
          >
            Сохранить
          </Button>
        )}
        <Button
          variant="default"
          disabled={disabled}
          onClick={() => void load()}
        >
          Обновить
        </Button>
      </Group>
    </Stack>
  );
}

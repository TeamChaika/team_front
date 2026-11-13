import { useState } from "react";
import {
  Alert,
  Button,
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

type Reason = {
  id: number;
  name: string;
  account_id: string;
  account_name: string;
  version: number;
};
type Directory = {
  reasons: Reason[];
  accounts: { id: string; name: string; code?: string | null }[];
};
const endpoint = "/documents/admin/writeoff-reasons";

function ReasonEditor({
  reason,
  accounts,
  close,
  saved,
  refresh,
}: {
  reason: Reason | null;
  accounts: Directory["accounts"];
  close: () => void;
  saved: () => void;
  refresh: () => void;
}) {
  const [name, setName] = useState(reason?.name ?? "");
  const [accountId, setAccountId] = useState<string | null>(
    reason?.account_id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const accountAvailable = accounts.some((account) => account.id === accountId);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || conflict || !name.trim() || !accountAvailable) return;
    setBusy(true);
    setError("");
    try {
      await api(reason ? `${endpoint}/${reason.id}` : endpoint, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          account_id: accountId,
          ...(reason ? { version: reason.version } : {}),
        }),
      });
      saved();
    } catch (error) {
      setError((error as Error).message);
      setConflict(error instanceof ApiError && error.status === 409);
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
      title={reason ? "Изменить причину списания" : "Новая причина списания"}
      closeOnClickOutside={false}
      closeOnEscape={!busy}
    >
      <form onSubmit={save}>
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          {conflict && (
            <Alert color="yellow">
              Обновите список и откройте причину заново. Введённые изменения не
              сохранены.
              <Button variant="subtle" onClick={refresh}>
                Обновить список
              </Button>
            </Alert>
          )}
          <TextInput
            label="Название причины"
            maxLength={128}
            required
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={busy}
          />
          <Select
            label="Счёт iiko"
            required
            searchable
            value={accountId}
            onChange={setAccountId}
            disabled={busy}
            nothingFoundMessage="Счёт не найден"
            data={accounts.map((account) => ({
              value: account.id,
              label: account.code
                ? `${account.name} · ${account.code}`
                : account.name,
            }))}
          />
          {reason && !accountAvailable && (
            <Alert color="yellow">
              Сохранённый счёт «{reason.account_name || reason.account_id}»
              отсутствует в актуальном списке. Выберите доступный счёт.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={busy}>
              Закрыть
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={conflict || !name.trim() || !accountAvailable}
            >
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function WriteoffReasons() {
  const state = useData<Directory>(endpoint);
  const [editing, setEditing] = useState<Reason | null | undefined>();
  const [notice, setNotice] = useState("");
  function refresh() {
    setEditing(undefined);
    state.reload();
  }
  return (
    <Stack>
      <Text c="dimmed">
        Укажите название причины списания и соответствующий счёт iiko.
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
          <Group justify="flex-end">
            <Button
              onClick={() => setEditing(null)}
              disabled={!state.data.accounts.length}
            >
              Добавить причину
            </Button>
          </Group>
          {!state.data.accounts.length && (
            <Alert color="yellow">
              Нет доступных счетов iiko. Обновите каталог счетов перед
              добавлением или изменением причины.
            </Alert>
          )}
          {!state.data.reasons.length && (
            <Text c="dimmed">Причины списания ещё не добавлены.</Text>
          )}
          {state.data.reasons.map((reason) => (
            <div className="management-card" key={reason.id}>
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={600}>{reason.name}</Text>
                  <Text size="sm" c="dimmed">
                    {reason.account_name || reason.account_id}
                  </Text>
                </div>
                <Button
                  variant="light"
                  aria-label={`Изменить причину «${reason.name}»`}
                  onClick={() => setEditing(reason)}
                >
                  Изменить
                </Button>
              </Group>
            </div>
          ))}
          {editing !== undefined && (
            <ReasonEditor
              reason={editing}
              accounts={state.data.accounts}
              close={() => setEditing(undefined)}
              refresh={refresh}
              saved={() => {
                setNotice("Причина списания сохранена.");
                refresh();
              }}
            />
          )}
        </>
      )}
    </Stack>
  );
}

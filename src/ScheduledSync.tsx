import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button } from "@mantine/core";
import { IconPlayerPlay } from "@tabler/icons-react";
import { api, ApiError, dateText } from "./api";
import {
  manualSyncControl,
  reconcileSyncRequests,
  syncRequestObserved,
  type ScheduledSyncTask,
} from "./scheduledSyncModel";
import "./scheduledSync.css";

const labels: Record<string, string> = {
  waiting: "Ожидает запуска",
  pending: "В очереди",
  running: "Выполняется",
  succeeded: "Завершено",
  failed: "Ошибка",
};

export function ScheduledSync({
  tasks,
  reload,
}: {
  tasks: ScheduledSyncTask[];
  reload: () => void;
}) {
  const sampledAt = useMemo(() => Date.now(), [tasks]);
  const [now, setNow] = useState(Date.now);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [accepted, setAccepted] = useState<
    Record<string, { id: string; requested_at: string }>
  >({});
  const [messages, setMessages] = useState<
    Record<string, { error: boolean; text: string }>
  >({});
  // Keep an uncertain request's identity so retrying cannot create a second run.
  const requests = useRef<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    const resolvedJobs = tasks
      .filter(
        (task) =>
          requests.current[task.job] &&
          task.manual?.request_id === requests.current[task.job],
      )
      .map((task) => task.job);
    requests.current = reconcileSyncRequests(requests.current, tasks);
    setAccepted((old) =>
      Object.fromEntries(
        Object.entries(old).filter(
          ([job, request]) =>
            !syncRequestObserved(
              tasks.find((task) => task.job === job)?.manual,
              request,
            ),
        ),
      ),
    );
    if (resolvedJobs.length)
      setMessages((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([job]) => !resolvedJobs.includes(job)),
        ),
      );
  }, [tasks]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      if (!document.hidden) reload();
    }, 15000);
    const onVisible = () => {
      if (!document.hidden) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  async function run(task: ScheduledSyncTask) {
    if (
      inFlight.current.has(task.job) ||
      manualSyncControl(task, (Date.now() - sampledAt) / 1000).disabled
    )
      return;
    inFlight.current.add(task.job);
    setSending((old) => ({ ...old, [task.job]: true }));
    setMessages((old) => {
      const next = { ...old };
      delete next[task.job];
      return next;
    });
    const requestId = requests.current[task.job] ?? crypto.randomUUID();
    requests.current[task.job] = requestId;
    try {
      const result = await api<{ state: string; requested_at: string }>(
        `/status/sync/${encodeURIComponent(task.job)}/run`,
        {
          method: "POST",
          body: JSON.stringify({ request_id: requestId }),
          signal: AbortSignal.timeout(20000),
        },
      );
      delete requests.current[task.job];
      if (["pending", "running"].includes(result.state))
        setAccepted((old) => ({
          ...old,
          [task.job]: { id: requestId, requested_at: result.requested_at },
        }));
      setMessages((old) => ({
        ...old,
        [task.job]: {
          error: false,
          text: labels[result.state] ?? "Запрос принят",
        },
      }));
    } catch (error) {
      const definitive = error instanceof ApiError && error.status < 500;
      if (definitive) delete requests.current[task.job];
      setMessages((old) => ({
        ...old,
        [task.job]: {
          error: true,
          text:
            error instanceof ApiError
              ? error.message
              : "Ответ не получен. Обновляем статус. Повторная попытка проверит тот же запрос.",
        },
      }));
    } finally {
      reload();
      inFlight.current.delete(task.job);
      setSending((old) => ({ ...old, [task.job]: false }));
    }
  }

  return (
    <section className="panel scheduled-sync">
      <div className="panel-heading">
        <div>
          <h2>Автоматическая синхронизация</h2>
          <p>
            Время: Крым, UTC+3. Ручной запуск каждой задачи — не чаще раза в 10
            минут.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table scheduled-sync-table">
          <thead>
            <tr>
              <th scope="col">Задача</th>
              <th scope="col">Расписание</th>
              <th scope="col">Статус</th>
              <th scope="col">Завершено</th>
              <th scope="col">Ошибка / повтор</th>
              <th scope="col">Ручной запуск</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const control = manualSyncControl(task, (now - sampledAt) / 1000);
              const manual = task.manual;
              const awaitingStatus = Boolean(
                accepted[task.job] &&
                  !syncRequestObserved(manual, accepted[task.job]),
              );
              const message = messages[task.job];
              return (
                <tr key={task.job}>
                  <th scope="row" className="sync-task-name">
                    {task.label}
                  </th>
                  <td data-label="Расписание" className="sync-task-schedule">
                    {task.schedule}
                  </td>
                  <td data-label="Статус">
                    <Badge
                      variant="light"
                      color={
                        task.status === "failed"
                          ? "red"
                          : task.status === "running"
                            ? "blue"
                            : "teal"
                      }
                    >
                      {labels[task.status ?? ""] ??
                        task.status ??
                        "Нет запусков"}
                    </Badge>
                  </td>
                  <td data-label="Завершено">
                    <span className="table-date">
                      {dateText(task.finished_at)}
                    </span>
                  </td>
                  <td data-label="Ошибка / повтор">
                    {task.error_code || "—"}
                    {task.next_retry_at && (
                      <small>{dateText(task.next_retry_at)}</small>
                    )}
                  </td>
                  <td className="sync-task-action">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPlayerPlay size={14} />}
                      loading={sending[task.job]}
                      disabled={control.disabled || awaitingStatus}
                      aria-label={`Запустить: ${task.label}`}
                      aria-describedby={
                        control.reason || awaitingStatus
                          ? `sync-reason-${task.job}`
                          : undefined
                      }
                      onClick={() => void run(task)}
                    >
                      Запустить
                    </Button>
                    {(control.reason || awaitingStatus) && (
                      <small id={`sync-reason-${task.job}`}>
                        {awaitingStatus ? "Обновляем статус…" : control.reason}
                      </small>
                    )}
                    {manual?.state &&
                      !["pending", "running"].includes(manual.state) && (
                        <small>
                          Ручной: {labels[manual.state]}
                          {manual.finished_at
                            ? ` · ${dateText(manual.finished_at)}`
                            : ""}
                          {manual.error_code ? ` · ${manual.error_code}` : ""}
                        </small>
                      )}
                    {message && (message.error || awaitingStatus) && (
                      <Alert
                        color={message.error ? "red" : "teal"}
                        p="xs"
                        mt="xs"
                        role={message.error ? "alert" : "status"}
                      >
                        {message.text}
                      </Alert>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

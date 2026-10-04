export type ManualSync = {
  can_run: boolean;
  blocked_reason:
    | "permission"
    | "scheduler_unavailable"
    | "pending"
    | "running"
    | "cooldown"
    | null;
  next_manual_run_at: string | null;
  remaining_seconds: number;
  state: "pending" | "running" | "succeeded" | "failed" | null;
  request_id: string | null;
  requested_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
};

export type ScheduledSyncTask = {
  job: string;
  label: string;
  schedule: string;
  status: string | null;
  finished_at: string | null;
  error_code: string | null;
  next_retry_at: string | null;
  scheduler_available?: boolean;
  manual?: ManualSync;
};

export function reconcileSyncRequests(
  requests: Record<string, string>,
  tasks: ScheduledSyncTask[],
) {
  const unresolved = { ...requests };
  for (const task of tasks) {
    if (task.manual?.request_id === unresolved[task.job])
      delete unresolved[task.job];
  }
  return unresolved;
}

export function syncRequestObserved(
  manual: ManualSync | undefined,
  request: { id: string; requested_at: string },
) {
  return (
    manual?.request_id === request.id ||
    Boolean(
      manual?.requested_at &&
        Date.parse(manual.requested_at) >= Date.parse(request.requested_at),
    )
  );
}

export function manualSyncControl(
  task: ScheduledSyncTask,
  elapsedSeconds: number,
) {
  const manual = task.manual;
  const remaining = Math.max(
    0,
    Math.ceil((manual?.remaining_seconds ?? 0) - Math.max(0, elapsedSeconds)),
  );
  let reason = "";
  if (!manual || manual.blocked_reason === "permission")
    reason = "Нет права запуска";
  else if (
    !task.scheduler_available ||
    manual.blocked_reason === "scheduler_unavailable"
  )
    reason = "Планировщик недоступен";
  else if (manual.state === "pending" || manual.blocked_reason === "pending")
    reason = "В очереди";
  else if (
    task.status === "running" ||
    manual.state === "running" ||
    manual.blocked_reason === "running"
  )
    reason = "Выполняется";
  else if (remaining > 0)
    reason = `Повтор через ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  else if (!manual.can_run && manual.blocked_reason !== "cooldown")
    reason = "Запуск недоступен";
  return { disabled: Boolean(reason), reason, remaining };
}

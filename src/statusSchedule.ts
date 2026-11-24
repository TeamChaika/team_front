import type { ScheduledSyncTask } from "./scheduledSyncModel";

export function cashShiftPage<T>(days: T[], requested: number) {
  const size = 30;
  const pages = Math.max(1, Math.ceil(days.length / size));
  const page = Math.min(Math.max(1, requested), pages);
  const end = days.length - (page - 1) * size;
  return {
    page,
    pages,
    rows: days.slice(Math.max(0, end - size), end).reverse(),
  };
}

export function watchSchedule(
  visibility: Document,
  load: (signal: AbortSignal) => Promise<{ scheduled?: ScheduledSyncTask[] }>,
  update: (tasks: ScheduledSyncTask[]) => void,
  onError: (error: unknown) => void,
) {
  let stopped = false;
  let pending: AbortController | undefined;
  async function read(replace: boolean) {
    if (stopped || (pending && !replace)) return;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    try {
      const result = await load(controller.signal);
      if (!controller.signal.aborted) update(result.scheduled ?? []);
    } catch (error) {
      if (!controller.signal.aborted) onError(error);
    } finally {
      if (pending === controller) pending = undefined;
    }
  }
  const poll = () => {
    if (!visibility.hidden) void read(false);
  };
  const timer = setInterval(poll, 15_000);
  visibility.addEventListener("visibilitychange", poll);
  return {
    refresh: () => void read(true),
    stop() {
      stopped = true;
      pending?.abort();
      clearInterval(timer);
      visibility.removeEventListener("visibilitychange", poll);
    },
  };
}

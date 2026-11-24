import { Button } from "@mantine/core";
import { dateText, type LiveSource } from "./api";
import { useWorkspace } from "./App";

export function LiveDataNotice({
  source,
  onRefresh,
}: {
  source?: LiveSource;
  onRefresh: () => void;
}) {
  const { meta, setPeriod } = useWorkspace();
  if (!source) return null;
  const live = source.source === "iiko_api" && source.status !== "sync_paused";
  const cacheSeconds = source.cache_seconds;
  let previousDay: string | undefined;
  if (source.status === "sync_paused" && meta.today) {
    for (const day of meta.sales_dates) {
      if (day < meta.today && (!previousDay || day > previousDay))
        previousDay = day;
    }
  }
  return (
    <div className="live-data-notice" role="status">
      <span>
        <strong>Сегодня · {live ? "iiko API" : "сохранённые данные"}</strong>
        {source.observed_at && ` · ${dateText(source.observed_at)}`}
        {source.status === "sync_paused" &&
          ". Синхронизация с iiko приостановлена."}
        {live && ". День ещё идёт."}
        {live &&
          typeof cacheSeconds === "number" &&
          Number.isFinite(cacheSeconds) &&
          cacheSeconds >= 0 &&
          ` Кеш — ${Math.round(cacheSeconds / 60)} мин.`}
        {live &&
          source.stale &&
          " iiko занят или недоступен: показан последний полученный срез."}
      </span>
      <Button size="compact-sm" variant="subtle" onClick={onRefresh}>
        Обновить
      </Button>
      {previousDay && (
        <Button
          size="compact-sm"
          variant="subtle"
          onClick={() => setPeriod(previousDay, previousDay)}
        >
          {`Открыть ${dateText(previousDay)}`}
        </Button>
      )}
    </div>
  );
}

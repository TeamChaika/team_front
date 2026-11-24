import { Button } from "@mantine/core";
import { dateText, reportTimeText, type LiveSource, type Sales } from "./api";
import { useWorkspace } from "./App";
import { DataSourceNotice } from "./DataSourceNotice";

export function SalesDataNotice({
  data,
  onRefresh,
}: {
  data: Pick<Sales, "live" | "data_status" | "start" | "end">;
  onRefresh: () => void;
}) {
  const { meta } = useWorkspace();
  const status = data.data_status;
  let source = data.live;
  if (source?.status === "sync_paused") return null;
  if (!source && status && meta.today && data.start <= meta.today && meta.today <= data.end) {
    source = {
      source: status.source,
      observed_at: status.observed_at,
      stale: Date.parse(status.expires_at) <= Date.now(),
    };
  }
  if (!source) return <DataSourceNotice status={status} />;
  if (source.source === "iiko_api" && !source.observed_at && status?.observed_at) {
    source = { ...source, observed_at: status.observed_at };
  }
  return <LiveDataNotice source={source} onRefresh={onRefresh} compact />;
}

export function LiveDataNotice({
  source,
  onRefresh,
  compact = false,
}: {
  source?: LiveSource;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const { meta, setPeriod } = useWorkspace();
  if (!source) return null;
  const live = source.source === "iiko_api" && source.status !== "sync_paused";
  const compactLive = compact && live;
  const observedTime = compactLive ? reportTimeText(source.observed_at) : null;
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
        {compactLive ? (
          <strong>Данные iiko{observedTime && ` на ${observedTime}`}</strong>
        ) : (
          <>
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
          </>
        )}
        {live &&
          source.stale &&
          (compactLive
            ? " · Данные устарели. Показан последний полученный отчёт."
            : " iiko занят или недоступен: показан последний полученный срез.")}
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

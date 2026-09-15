import { Button } from "@mantine/core";
import { dateText, type LiveSource } from "./api";

export function LiveDataNotice({
  source,
  onRefresh,
}: {
  source?: LiveSource;
  onRefresh: () => void;
}) {
  if (!source) return null;
  return (
    <div className="live-data-notice" role="status">
      <span>
        <strong>Сегодня · iiko API</strong> · {dateText(source.observed_at)}.
        День ещё идёт. Кеш — {Math.round(source.cache_seconds / 60)} мин.
        {source.stale &&
          " iiko занят или недоступен: показан последний полученный срез."}
      </span>
      <Button size="compact-sm" variant="subtle" onClick={onRefresh}>
        Обновить
      </Button>
    </div>
  );
}

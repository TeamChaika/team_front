import { dateText, type DataStatus } from "./api";

export function DataSourceNotice({ status }: { status?: DataStatus }) {
  if (!status) return null;
  return (
    <p className="section-note" role="status">
      Данные из iiko · Обновлено: {dateText(status.observed_at)} · Кеш до{" "}
      {dateText(status.expires_at)}
    </p>
  );
}

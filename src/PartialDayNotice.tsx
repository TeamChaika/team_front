import { Alert } from "@mantine/core";
import { dateText } from "./api";

export type PartialDay = { date: string; observed_at: string };

export function PartialDayNotice({ days = [] }: { days?: PartialDay[] }) {
  if (!days.length) return null;
  return (
    <Alert color="orange" title="Предварительные данные" role="status" mb="md">
      {days.map((day) => (
        <div key={day.date}>
          {dateText(day.date)}: срез получен {dateText(day.observed_at)}, до
          окончания дня.
        </div>
      ))}
      Итоги и сравнение периодов предварительные. Для окончательных сумм нужно
      обновление после завершения дня.
    </Alert>
  );
}

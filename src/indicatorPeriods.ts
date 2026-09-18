export type Preset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom";
export type Range = { start: string; end: string };
export type Periods = Range & { previous_start: string; previous_end: string };
export const presets: { value: Preset; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "this_week", label: "Текущая неделя" },
  { value: "last_week", label: "Прошлая неделя" },
  { value: "this_month", label: "Текущий месяц" },
  { value: "last_month", label: "Прошлый месяц" },
  { value: "this_year", label: "Текущий год" },
  { value: "last_year", label: "Прошлый год" },
  { value: "custom", label: "Свой диапазон" },
];
export function shiftDate(day: string, count: number): string {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function iso(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, 12)).toISOString().slice(0, 10);
}
export function periods(preset: Preset, today: string, custom: Range): Periods {
  const date = new Date(today + "T12:00:00Z");
  const y = date.getUTCFullYear(),
    m = date.getUTCMonth(),
    d = date.getUTCDate();
  let start = today,
    end = today,
    previous_start: string | undefined,
    previous_end: string | undefined;
  if (preset === "custom") ({ start, end } = custom);
  if (preset === "yesterday") start = end = shiftDate(today, -1);
  if (preset === "this_week" || preset === "last_week") {
    const monday = shiftDate(today, -(date.getUTCDay() + 6) % 7);
    start = preset === "this_week" ? monday : shiftDate(monday, -7);
    end = preset === "this_week" ? today : shiftDate(monday, -1);
    previous_start = shiftDate(start, -7);
    previous_end = shiftDate(end, -7);
  }
  if (preset === "this_month" || preset === "last_month") {
    const offset = preset === "this_month" ? 0 : -1;
    start = iso(y, m + offset, 1);
    end = preset === "this_month" ? today : iso(y, m, 0);
    previous_start = iso(y, m + offset - 1, 1);
    const monthEnd = iso(y, m + offset, 0);
    previous_end =
      preset === "last_month"
        ? monthEnd
        : iso(y, m - 1, Math.min(d, Number(monthEnd.slice(-2))));
  }
  if (preset === "this_year" || preset === "last_year") {
    const year = y - (preset === "last_year" ? 1 : 0);
    start = iso(year, 0, 1);
    end = preset === "this_year" ? today : iso(year, 11, 31);
    previous_start = iso(year - 1, 0, 1);
    previous_end =
      preset === "last_year"
        ? iso(year - 1, 11, 31)
        : iso(
            year - 1,
            m,
            Math.min(d, Number(iso(year - 1, m + 1, 0).slice(-2))),
          );
  }
  if (!previous_start || !previous_end) {
    const days =
      Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    previous_start = shiftDate(start, -days);
    previous_end = shiftDate(start, -1);
  }
  return { start, end, previous_start, previous_end };
}

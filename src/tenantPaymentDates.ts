export function tenantToday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
/** Convert company wall time into a UTC instant; reject a skipped DST time. */
export function tenantDateTime(
  date: string,
  time: string,
  timezone: string,
): string {
  const target = new Date(`${date}T${time}:00Z`).getTime();
  if (!Number.isFinite(target))
    throw new Error("Некорректная дата бронирования.");
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (key: string) => parts.find((p) => p.type === key)!.value;
    const wall = Date.parse(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`,
    );
    const correction = target - wall;
    if (!correction) return new Date(instant).toISOString();
    instant += correction;
  }
  throw new Error(
    "Это время отсутствует в часовом поясе компании. Выберите другое время.",
  );
}
export function tenantDateText(value: string | null, timezone: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

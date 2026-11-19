export const KITCHEN_HEATMAP_PATH = "/sales/kitchen-heatmap";
const DAY = 86_400_000;
const CHUNK_DAYS = 7;
export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export type HeatmapPeriod = { date_from: string; date_to: string };
export type HeatmapSelection = HeatmapPeriod & { department_id: string };
export type HeatmapStation = {
  id: string;
  name: string;
  hours: number[];
  peak_hours?: number[];
  revenue_kopecks?: number[];
  first_print_minutes?: Record<string, number>;
};
export type HeatmapMode = "portions" | "money";
export type SentToKitchen = {
  stations: HeatmapStation[];
  unassigned_portions: number;
  unprinted_portions: number;
  unassigned_revenue_kopecks?: number;
  revenue_complete: boolean;
  all_active_unprinted: boolean;
  first_print_complete: boolean;
};
export type HeatmapResponse = HeatmapSelection & {
  sent_to_kitchen: SentToKitchen;
};

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return NaN;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && formatDate(time) === value ? time : NaN;
}

function formatDate(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

export function validateHeatmapPeriod(
  dateFrom: string,
  dateTo: string,
  today?: string,
) {
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo);
  if (!Number.isFinite(from) || !Number.isFinite(to))
    return "Укажите обе учётные даты.";
  if (from > to)
    return "Начало периода должно быть раньше конца или совпадать с ним.";
  if (today && dateTo > today) return "Выберите дату не позднее сегодняшней.";
  return "";
}

export function linkedHeatmapSelection(
  search: string,
  departments: readonly { id: string }[],
  today?: string,
): HeatmapSelection | null {
  const query = new URLSearchParams(search);
  const [departmentId, ...extraDepartments] = query.getAll("department_id");
  const [dateFrom, ...extraStarts] = query.getAll("date_from");
  const [dateTo, ...extraEnds] = query.getAll("date_to");
  if (
    !departmentId ||
    extraDepartments.length ||
    !dateFrom ||
    extraStarts.length ||
    !dateTo ||
    extraEnds.length ||
    !today ||
    validateHeatmapPeriod(dateFrom, dateTo, today) ||
    !departments.some(({ id }) => id === departmentId)
  )
    return null;
  return { department_id: departmentId, date_from: dateFrom, date_to: dateTo };
}

export function linkedHeatmapMode(search: string): HeatmapMode {
  const [mode, ...extraModes] = new URLSearchParams(search).getAll("mode");
  return mode === "money" && extraModes.length === 0 ? "money" : "portions";
}

const invalidReport = "Получен неполный или неверный отчёт.";

type StationTotals = Omit<HeatmapStation, "hours" | "revenue_kopecks"> & {
  hours: bigint[];
  revenue_kopecks?: bigint[];
};

export async function loadKitchenHeatmap(
  selection: HeatmapSelection,
  fetchChunk: (
    period: HeatmapSelection,
    signal: AbortSignal,
  ) => Promise<unknown>,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<HeatmapResponse> {
  const validation = validateHeatmapPeriod(
    selection.date_from,
    selection.date_to,
  );
  if (validation) throw new Error(validation);
  const start = parseDate(selection.date_from);
  const end = parseDate(selection.date_to);
  const total = Math.ceil(((end - start) / DAY + 1) / CHUNK_DAYS);
  const stations = new Map<string, StationTotals>();
  let unassignedPortions = 0n;
  let unprintedPortions = 0n;
  let unassignedMoney = 0n;
  let revenueComplete = true;
  let hasActivePrint = false;
  let firstPrintComplete = true;
  let done = 0;

  onProgress(done, total);
  for (let from = start; from <= end; from += CHUNK_DAYS * DAY) {
    signal.throwIfAborted();
    const period = {
      department_id: selection.department_id,
      date_from: formatDate(from),
      date_to: formatDate(Math.min(end, from + (CHUNK_DAYS - 1) * DAY)),
    };
    const result = await fetchChunk(period, signal);
    signal.throwIfAborted();
    if (
      !isRecord(result) ||
      result.department_id !== period.department_id ||
      result.date_from !== period.date_from ||
      result.date_to !== period.date_to
    )
      throw new Error(invalidReport);
    const sent = result.sent_to_kitchen;
    if (
      !isRecord(sent) ||
      !validQuantity(sent.unassigned_portions) ||
      !validQuantity(sent.unprinted_portions) ||
      !validStations(sent.stations)
    )
      throw new Error(invalidReport);

    if (
      sent.has_active_print !== undefined &&
      typeof sent.has_active_print !== "boolean"
    )
      throw new Error(invalidReport);
    hasActivePrint ||=
      sent.has_active_print ??
      (sent.unassigned_portions > 0 ||
        sent.stations.some(({ hours }) => hours.some((value) => value > 0)));
    unassignedPortions += decimalUnits(sent.unassigned_portions);
    unprintedPortions += decimalUnits(sent.unprinted_portions);
    revenueComplete =
      revenueComplete &&
      sent.revenue_complete === true &&
      safeInteger(sent.unassigned_revenue_kopecks);
    if (revenueComplete && safeInteger(sent.unassigned_revenue_kopecks))
      unassignedMoney += BigInt(sent.unassigned_revenue_kopecks);

    for (const station of sent.stations) {
      const previous = stations.get(station.id);
      const hours = station.hours.map(
        (value, hour) => decimalUnits(value) + (previous?.hours[hour] ?? 0n),
      );
      const revenue = validHourlyRevenue(station.revenue_kopecks)
        ? station.revenue_kopecks.map(
            (value, hour) =>
              BigInt(value) + (previous?.revenue_kopecks?.[hour] ?? 0n),
          )
        : undefined;
      const active = station.hours.some((value) => value > 0);
      const firstPrints = station.first_print_minutes;
      const validPrints =
        validFirstPrints(firstPrints, period) &&
        (!active || Object.keys(firstPrints).length > 0);
      firstPrintComplete &&= validPrints;
      revenueComplete &&= revenue !== undefined;
      stations.set(station.id, {
        id: station.id,
        name:
          station.name === station.id && previous
            ? previous.name
            : station.name,
        hours,
        revenue_kopecks: revenue,
        first_print_minutes: validPrints
          ? { ...previous?.first_print_minutes, ...firstPrints }
          : undefined,
      });
    }
    onProgress(++done, total);
  }
  const sorted = [...stations.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name, "ru-RU") ||
      left.id.localeCompare(right.id),
  );
  if (
    !Number.isFinite(
      decimalNumber(
        sumIntegers(sorted.map(({ hours }) => sumIntegers(hours))) +
          unprintedPortions +
          unassignedPortions,
      ),
    )
  )
    throw new Error(invalidReport);
  const allActiveUnprinted = !hasActivePrint && unprintedPortions > 0n;
  revenueComplete &&= !allActiveUnprinted;
  if (revenueComplete) {
    const hourly = HOURS.map((hour) =>
      sumIntegers(sorted.map((station) => station.revenue_kopecks![hour])),
    );
    revenueComplete =
      withinSafeInteger(unassignedMoney) &&
      hourly.every(withinSafeInteger) &&
      withinSafeInteger(sumIntegers(hourly)) &&
      sorted.every(
        ({ revenue_kopecks }) =>
          revenue_kopecks!.every(withinSafeInteger) &&
          withinSafeInteger(sumIntegers(revenue_kopecks!)),
      );
  }
  return {
    ...selection,
    sent_to_kitchen: {
      stations: sorted.map((station) => ({
        id: station.id,
        name: station.name,
        hours: station.hours.map(decimalNumber),
        peak_hours: exactPeakHours(station.hours),
        ...(revenueComplete
          ? { revenue_kopecks: station.revenue_kopecks!.map(Number) }
          : {}),
        ...(firstPrintComplete
          ? { first_print_minutes: station.first_print_minutes }
          : {}),
      })),
      unassigned_portions: decimalNumber(unassignedPortions),
      unprinted_portions: decimalNumber(unprintedPortions),
      revenue_complete: revenueComplete,
      all_active_unprinted: allActiveUnprinted,
      first_print_complete: firstPrintComplete,
      ...(revenueComplete
        ? { unassigned_revenue_kopecks: Number(unassignedMoney) }
        : {}),
    },
  };
}

function validStations(value: unknown): value is HeatmapStation[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const station of value) {
    if (
      !isRecord(station) ||
      typeof station.id !== "string" ||
      !station.id.trim() ||
      typeof station.name !== "string" ||
      !station.name.trim() ||
      seen.has(station.id) ||
      !Array.isArray(station.hours) ||
      station.hours.length !== HOURS.length ||
      !station.hours.every(validQuantity)
    )
      return false;
    seen.add(station.id);
  }
  return true;
}

function validHourlyRevenue(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === HOURS.length &&
    value.every(safeInteger)
  );
}

function validFirstPrints(
  value: unknown,
  period: HeatmapPeriod,
): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([date, minute]) =>
        Number.isFinite(parseDate(date)) &&
        date >= period.date_from &&
        date <= period.date_to &&
        safeInteger(minute),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

// Interpret each supplied number as its shortest decimal representation.
// 10^-324 is sufficient for every finite nonnegative JavaScript number.
const DECIMAL_PLACES = 324;
function decimalUnits(value: number) {
  if (!value) return 0n;
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return (
    BigInt(whole + fraction) *
    10n ** BigInt(DECIMAL_PLACES + Number(exponent) - fraction.length)
  );
}

function decimalNumber(units: bigint) {
  return Number(`${units}e-${DECIMAL_PLACES}`);
}

function sumIntegers(values: readonly bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function withinSafeInteger(value: bigint) {
  return value >= -MAX_SAFE && value <= MAX_SAFE;
}

export function sumPortions(values: readonly number[]) {
  return decimalNumber(sumIntegers(values.map(decimalUnits)));
}

export function sumKopecks(values: readonly number[]) {
  return Number(sumIntegers(values.map((value) => BigInt(value))));
}

const rubles = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const kop = new Intl.NumberFormat("ru-RU", { minimumIntegerDigits: 2 });
export const moneyText = (value: number) => {
  const absolute = BigInt(Math.abs(value));
  const kopecks = absolute % 100n;
  return (
    (value < 0 ? "−" : "") +
    rubles.format(absolute / 100n) +
    (kopecks ? "," + kop.format(kopecks) : "") +
    " ₽"
  );
};

function exactPeakHours(hours: bigint[]) {
  const peak = hours.reduce(
    (maximum, value) => (value > maximum ? value : maximum),
    0n,
  );
  return peak ? HOURS.filter((hour) => hours[hour] === peak) : [];
}

export function heatLevel(value: number, maximum: number) {
  return value !== 0 ? Math.ceil((Math.abs(value) / maximum) * 4) : 0;
}

export function stationPlanning(station: HeatmapStation) {
  const daily = Object.values(station.first_print_minutes ?? {}).sort(
    (a, b) => a - b,
  );
  const middle = Math.floor(daily.length / 2);
  const first =
    daily.length % 2
      ? daily[middle]
      : daily[middle - 1] / 2 + daily[middle] / 2;
  const peak = Math.max(...station.hours);
  return {
    activeDays: daily.length,
    first: daily.length ? first : undefined,
    peak,
    peakHours:
      station.peak_hours ??
      (peak ? HOURS.filter((hour) => station.hours[hour] === peak) : []),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");
export const hourText = (hour: number) => `${pad(hour)}:00`;

export function accountingTime(minute: number) {
  const day = Math.floor(minute / 1440);
  const time = ((minute % 1440) + 1440) % 1440;
  const clock = `${pad(Math.floor(time / 60))}:${pad(Math.floor(time % 60))}${time % 1 ? ":30" : ""}`;
  const days =
    day === 1
      ? "след. день"
      : day === -1
        ? "накануне"
        : `${day > 0 ? "+" : "−"}${Math.abs(day)} дн.`;
  return day ? `${clock} (${days})` : clock;
}

export function preparationMinutes(value: string): number | undefined {
  const minutes = Number(value);
  return /^\d{1,4}$/.test(value) && minutes >= 0 && minutes <= 1440
    ? minutes
    : undefined;
}

export function preparationKey(
  userId: string,
  departmentId: string,
  stationId: string,
) {
  return (
    "kitchen-heatmap-preparation:" +
    JSON.stringify([userId, departmentId, stationId])
  );
}

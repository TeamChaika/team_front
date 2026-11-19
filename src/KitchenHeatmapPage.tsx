import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Loader, SegmentedControl } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useWorkspace } from "./App";
import { api, dateText } from "./api";
import { PageTitle } from "./pages";
import {
  HOURS,
  accountingTime,
  hourText,
  moneyText,
  preparationKey,
  preparationMinutes,
  stationPlanning,
  sumKopecks,
  sumPortions,
  type SentToKitchen,
  heatLevel,
  linkedHeatmapMode,
  linkedHeatmapSelection,
  loadKitchenHeatmap,
  type HeatmapMode,
  type HeatmapStation,
  validateHeatmapPeriod,
  type HeatmapResponse,
  type HeatmapSelection,
} from "./kitchenHeatmap";
import "./kitchenHeatmap.css";

const modeOptions = [
  { value: "portions", label: "Порции" },
  { value: "money", label: "Сумма после скидок, ₽" },
];
const quantity = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 12 });
function stationLabels(stations: HeatmapStation[]) {
  const counts = new Map<string, number>();
  for (const { name } of stations)
    counts.set(name, (counts.get(name) ?? 0) + 1);
  return new Map(
    stations.map(({ id, name }) => [
      id,
      counts.get(name) === 1 ? name : `${name} · ${id}`,
    ]),
  );
}

export default function KitchenHeatmapPage() {
  const { meta, departments, start, end } = useWorkspace();
  const { search } = useLocation();
  const [mode, setMode] = useState(() => linkedHeatmapMode(search));
  const initialDate = meta.sales_dates[0] || meta.today || start;
  const useWorkspacePeriod = !validateHeatmapPeriod(start, end, meta.today);
  const initialFrom = useWorkspacePeriod ? start : initialDate;
  const initialTo = useWorkspacePeriod ? end : initialDate;
  const initialDepartment =
    departments.length === 1 &&
    meta.departments.some(({ id }) => id === departments[0])
      ? departments[0]
      : meta.departments.length === 1
        ? meta.departments[0].id
        : "";
  const [preset] = useState(() =>
    linkedHeatmapSelection(search, meta.departments, meta.today),
  );
  const [department, setDepartment] = useState(
    preset?.department_id ?? initialDepartment,
  );
  const [from, setFrom] = useState(preset?.date_from ?? initialFrom);
  const [to, setTo] = useState(preset?.date_to ?? initialTo);
  const [selection, setSelection] = useState<HeatmapSelection | null>(null);
  const available = meta.departments.some(({ id }) => id === department);
  const reportDepartment = meta.departments.find(
    ({ id }) => id === selection?.department_id,
  );
  const validation = validateHeatmapPeriod(from, to, meta.today);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (available && !validation)
      setSelection({ department_id: department, date_from: from, date_to: to });
  }

  return (
    <section className="kitchen-heatmap">
      <Link className="kitchen-heatmap-back" to="/sales">
        <IconArrowLeft size={16} /> Продажи
      </Link>
      <PageTitle
        title="Тепловая карта цехов"
        subtitle="Нагрузка по часу сервисной печати. Карта учитывает позиции с указанным временем печати за выбранные учётные даты."
      />
      {meta.departments.length === 0 ? (
        <Alert>Нет доступных заведений для отчёта.</Alert>
      ) : (
        <form className="kitchen-heatmap-filters" onSubmit={submit}>
          <label>
            Заведение
            <select
              required
              value={available ? department : ""}
              onChange={(event) => {
                setDepartment(event.currentTarget.value);
                setSelection(null);
              }}
            >
              <option value="" disabled>
                Выберите заведение
              </option>
              {meta.departments.map(({ id, name, archived }) => (
                <option key={id} value={id}>
                  {name}
                  {archived ? " · архив" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Начало периода
            <input
              required
              type="date"
              max={meta.today}
              value={from}
              onChange={(event) => {
                setFrom(event.currentTarget.value);
                setSelection(null);
              }}
            />
          </label>
          <label>
            Конец периода
            <input
              required
              type="date"
              min={from || undefined}
              max={meta.today}
              value={to}
              onChange={(event) => {
                setTo(event.currentTarget.value);
                setSelection(null);
              }}
            />
          </label>
          <Button type="submit" disabled={!available || Boolean(validation)}>
            Показать
          </Button>
          {validation && (
            <p className="kitchen-heatmap-filter-message" role="status">
              {validation}
            </p>
          )}
        </form>
      )}
      {meta.departments.length > 0 && (
        <SegmentedControl
          className="kitchen-heatmap-mode"
          aria-label="Показатель тепловой карты"
          data={modeOptions}
          value={mode}
          onChange={(value) =>
            setMode(value === "money" ? "money" : "portions")
          }
        />
      )}
      {selection && reportDepartment && (
        <HeatmapReport
          selection={selection}
          departmentName={reportDepartment.name}
          mode={mode}
          userId={meta.user.id}
        />
      )}
    </section>
  );
}

function HeatmapReport({
  selection,
  departmentName,
  mode,
  userId,
}: {
  selection: HeatmapSelection;
  departmentName: string;
  mode: HeatmapMode;
  userId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<
    | { selection: HeatmapSelection; attempt: number; report: HeatmapResponse }
    | { selection: HeatmapSelection; attempt: number; error: string }
    | null
  >(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  useEffect(() => {
    const controller = new AbortController();
    loadKitchenHeatmap(
      selection,
      (period, signal) =>
        api<unknown>("/sales/kitchen/heatmap?" + new URLSearchParams(period), {
          signal,
        }),
      controller.signal,
      (done, total) => setProgress({ done, total }),
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setOutcome({ selection, attempt, report: result });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOutcome({
            selection,
            attempt,
            error:
              error instanceof Error && error.message
                ? error.message
                : "Не удалось загрузить отчёт.",
          });
        }
      });
    return () => controller.abort();
  }, [selection, attempt]);

  const current =
    outcome?.selection === selection && outcome.attempt === attempt
      ? outcome
      : null;
  if (current && "error" in current) {
    return (
      <Alert color="red" title="Отчёт не загружен">
        <p>{current.error}</p>
        <Button
          variant="light"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Повторить
        </Button>
      </Alert>
    );
  }
  if (!current) {
    return (
      <div className="loading" role="status">
        <Loader size="sm" /> Загружаем отчёт
        {progress.total > 1 &&
          ` · ${progress.done} из ${progress.total} частей периода`}
      </div>
    );
  }
  const { report } = current;
  const from = dateText(report.date_from);
  const period =
    report.date_from === report.date_to
      ? `Учётная дата ${from}`
      : `Учётные даты ${from} — ${dateText(report.date_to)}`;
  const series = report.sent_to_kitchen;
  const labels = stationLabels(series.stations);
  return (
    <>
      <p id="kitchen-heatmap-report-period">
        {departmentName} · {period}
      </p>
      <HeatmapTable mode={mode} series={series} labels={labels} />
      {series.revenue_complete && series.stations.length > 0 && (
        <MoneyChart stations={series.stations} labels={labels} />
      )}
      {series.stations.length > 0 && (
        <PlanningTable
          key={JSON.stringify([userId, selection.department_id])}
          stations={series.stations}
          labels={labels}
          firstPrintComplete={series.first_print_complete}
          multipleDays={report.date_from !== report.date_to}
          userId={userId}
          departmentId={selection.department_id}
        />
      )}
    </>
  );
}

type StationLabels = Map<string, string>;

function HeatmapTable({
  mode,
  series,
  labels,
}: {
  mode: HeatmapMode;
  series: SentToKitchen;
  labels: StationLabels;
}) {
  const money = mode === "money";
  if (money && series.all_active_unprinted)
    return (
      <Alert>
        Сумму нельзя разнести по часам. Порции без времени печати —{" "}
        {quantity.format(series.unprinted_portions)}.
      </Alert>
    );
  if (money && !series.revenue_complete)
    return (
      <Alert>Сумма после скидок недоступна за весь выбранный период.</Alert>
    );

  const format = money ? moneyText : (value: number) => quantity.format(value);
  const sum = money ? sumKopecks : sumPortions;
  const rows = series.stations.map((station) => ({
    id: station.id,
    values: money ? station.revenue_kopecks! : station.hours,
  }));
  const hourlyTotals = HOURS.map((hour) =>
    sum(rows.map(({ values }) => values[hour])),
  );
  const total = sum(hourlyTotals);
  const maximum = rows.reduce(
    (max, { values }) => Math.max(max, ...values.map(Math.abs)),
    0,
  );
  const unassigned = money
    ? series.unassigned_revenue_kopecks!
    : series.unassigned_portions;
  const caption = money
    ? "Сумма после скидок по часам печати"
    : "Напечатанные порции по часам";

  return (
    <>
      <dl className="kitchen-heatmap-summary">
        <div>
          <dt>{money ? "Сумма по цехам" : "Напечатано по цехам"}</dt>
          <dd>{format(total)}</dd>
        </div>
        <div>
          <dt>{money ? "Сумма печати без цеха" : "Напечатано без цеха"}</dt>
          <dd>{format(unassigned)}</dd>
        </div>
        <div>
          <dt>Порции без времени печати</dt>
          <dd>{quantity.format(series.unprinted_portions)}</dd>
        </div>
      </dl>
      {rows.length === 0 && (
        <Alert>
          {unassigned !== 0
            ? "Есть сервисная печать без указанного цеха."
            : series.unprinted_portions > 0
              ? "За период есть порции без времени печати. Они не входят в карту и диаграмму."
              : "За период нет данных сервисной печати по цехам."}
        </Alert>
      )}
      {rows.length > 0 && (
        <>
          <div className="kitchen-heatmap-legend" aria-label="Легенда цветов">
            <span data-level={0}>{format(0)}</span>
            {maximum > 0 && (
              <>
                <span>{money ? "Меньше по модулю" : "Меньше"}</span>
                {[1, 2, 3, 4].map((level) => (
                  <i key={level} data-level={level} aria-hidden="true" />
                ))}
                <span>
                  Больше · до {format(maximum)}
                  {money ? "" : " порций"}
                </span>
              </>
            )}
          </div>
          <div
            className="kitchen-heatmap-scroll"
            role="region"
            tabIndex={0}
            aria-label={caption}
          >
            <table
              className="kitchen-heatmap-table"
              aria-labelledby="kitchen-heatmap-report-period"
            >
              <thead>
                <tr>
                  <th scope="col">Цех</th>
                  {HOURS.map((hour) => (
                    <th key={hour} scope="col">
                      {hourText(hour)}
                    </th>
                  ))}
                  <th scope="col">Итого</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ id, values }) => (
                  <tr key={id}>
                    <th scope="row">{labels.get(id)}</th>
                    {values.map((value, hour) => (
                      <td key={hour} data-level={heatLevel(value, maximum)}>
                        {format(value)}
                      </td>
                    ))}
                    <td>{format(sum(values))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Итого</th>
                  {hourlyTotals.map((value, hour) => (
                    <td key={hour}>{format(value)}</td>
                  ))}
                  <td>{format(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function MoneyChart({
  stations,
  labels,
}: {
  stations: HeatmapStation[];
  labels: StationLabels;
}) {
  const [id, setId] = useState("");
  const selected = stations.find((station) => station.id === id);
  const values =
    selected?.revenue_kopecks ??
    HOURS.map((hour) =>
      sumKopecks(stations.map((station) => station.revenue_kopecks![hour])),
    );
  const high = Math.max(0, ...values);
  const low = Math.min(0, ...values);
  const range = BigInt(high) - BigInt(low) || 1n;
  const percent = (value: number) =>
    Number((BigInt(value) * 100_000_000n) / range) / 1_000_000;
  const zero = high === 0 && low === 0 ? 100 : percent(high);
  return (
    <section
      className="kitchen-heatmap-panel"
      aria-labelledby="kitchen-money-heading"
    >
      <div className="kitchen-chart-header">
        <div>
          <h2 id="kitchen-money-heading">Сумма после скидок по часам</h2>
          <p>
            По позициям с временем сервисной печати. Итого{" "}
            {moneyText(sumKopecks(values))}
          </p>
        </div>
        <label>
          Цех на диаграмме
          <select
            value={selected?.id ?? ""}
            onChange={(event) => setId(event.currentTarget.value)}
          >
            <option value="">Все цеха</option>
            {stations.map(({ id }) => (
              <option key={id} value={id}>
                {labels.get(id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="kitchen-chart-scale">
        Шкала {moneyText(low)} — {moneyText(high)}
      </p>
      <div
        className="kitchen-heatmap-scroll"
        role="region"
        tabIndex={0}
        aria-label="Почасовая диаграмма"
      >
        <ol className="kitchen-chart">
          {values.map((value, hour) => (
            <li
              key={hour}
              tabIndex={0}
              aria-label={`${hourText(hour)} · ${moneyText(value)}`}
            >
              <span className="kitchen-chart-amount" aria-hidden="true">
                {moneyText(value)}
              </span>
              <div className="kitchen-chart-track" aria-hidden="true">
                <span
                  className="kitchen-chart-zero"
                  style={{ top: `${zero}%` }}
                />
                <span
                  className={
                    value < 0
                      ? "kitchen-chart-bar negative"
                      : "kitchen-chart-bar"
                  }
                  style={{
                    top: `${value > 0 ? Math.max(0, zero - percent(value)) : zero}%`,
                    height: `${percent(Math.abs(value))}%`,
                  }}
                />
              </div>
              <time aria-hidden="true">{hourText(hour)}</time>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PlanningTable({
  stations,
  labels,
  firstPrintComplete,
  multipleDays,
  userId,
  departmentId,
}: {
  stations: HeatmapStation[];
  labels: StationLabels;
  firstPrintComplete: boolean;
  multipleDays: boolean;
  userId: string;
  departmentId: string;
}) {
  return (
    <section
      className="kitchen-heatmap-panel"
      aria-labelledby="kitchen-plan-heading"
    >
      <h2 id="kitchen-plan-heading">Планирование смены по цехам</h2>
      <p>
        {multipleDays
          ? "Медиана — середина ряда времени первой печати по дням с печатью. При чётном числе дней берём среднее двух центральных значений."
          : "Первая сервисная печать за учётный день."}{" "}
        Рекомендуемое начало — время первой печати за вычетом минут на
        подготовку.
      </p>
      {!firstPrintComplete && (
        <Alert>Время первой печати недоступно за весь выбранный период.</Alert>
      )}
      <div
        className="kitchen-heatmap-scroll"
        role="region"
        tabIndex={0}
        aria-label="Планирование смены по цехам"
      >
        <table className="kitchen-heatmap-table kitchen-plan-table">
          <thead>
            <tr>
              <th scope="col">Цех</th>
              <th scope="col">
                {multipleDays ? "Первая печать, медиана" : "Первая печать"}
              </th>
              {multipleDays && <th scope="col">Дней с печатью</th>}
              <th scope="col">
                {multipleDays
                  ? "Пик, порций за период в этот час"
                  : "Пик, порций за час"}
              </th>
              <th scope="col">Подготовка, мин.</th>
              <th scope="col">Начало подготовки</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <PlanningRow
                key={station.id}
                station={station}
                name={labels.get(station.id) ?? station.name}
                firstPrintComplete={firstPrintComplete}
                multipleDays={multipleDays}
                storageKey={preparationKey(userId, departmentId, station.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlanningRow({
  station,
  name,
  firstPrintComplete,
  multipleDays,
  storageKey,
}: {
  station: HeatmapStation;
  name: string;
  firstPrintComplete: boolean;
  multipleDays: boolean;
  storageKey: string;
}) {
  const { first, activeDays, peak, peakHours } = stationPlanning(station);
  const [entry, setEntry] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey) ?? "";
      return preparationMinutes(stored) === undefined ? "" : stored;
    } catch {
      return "";
    }
  });
  const [storageFailed, setStorageFailed] = useState(false);
  const minutes = preparationMinutes(entry);
  const invalid = entry !== "" && minutes === undefined;

  function update(value: string) {
    setEntry(value);
    if (value !== "" && preparationMinutes(value) === undefined) return;
    try {
      if (value) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }

  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{first === undefined ? "—" : accountingTime(first)}</td>
      {multipleDays && <td>{firstPrintComplete ? activeDays : "—"}</td>}
      <td className="kitchen-plan-peak">
        {peakHours.length
          ? `${peakHours.map(hourText).join(", ")} · ${quantity.format(peak)}`
          : "—"}
      </td>
      <td>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${name}: минут на подготовку`}
          aria-invalid={invalid}
          value={entry}
          onChange={(event) => update(event.currentTarget.value)}
        />
        {invalid && <div role="status">Целое число от 0 до 1440</div>}
        {storageFailed && <div role="status">Браузер не сохранил значение</div>}
      </td>
      <td>
        {first !== undefined && minutes !== undefined
          ? accountingTime(first - minutes)
          : "—"}
      </td>
    </tr>
  );
}

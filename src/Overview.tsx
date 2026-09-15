import { useState } from "react";
import { LiveDataNotice } from "./LiveDataNotice";
import { PartialDayNotice, type PartialDay } from "./PartialDayNotice";
import { Link, useNavigate } from "react-router-dom";
import { Alert, SegmentedControl, Select, Button } from "@mantine/core";
import {
  IconArrowUpRight,
  IconChartBar,
  IconCurrencyRubel,
  IconDownload,
  IconBell,
  IconArrowRight,
  IconChefHat,
  IconUsers,
  IconCoins,
  IconChartDonut,
} from "@tabler/icons-react";
import { useWorkspace } from "./App";
import { Feedback } from "./pages";
import { useData } from "./useData";
import { number, dateText, csv, type Sales } from "./api";
import {
  OverviewPortal,
  PriceLeaders,
  OverviewNotifications,
  OverviewPriceModal,
  dashboardNumber as money,
  type PriceReport,
} from "./OverviewCards";
import { type PriceChange } from "./PurchasePrices";
import "./overview.css";

type Metric =
  | "revenue"
  | "cost"
  | "gross_profit"
  | "average_check"
  | "checks"
  | "guests"
  | "cost_share"
  | "margin"
  | "guests_per_day";
type Totals = Record<Metric, string | null>;
type Change = { absolute: string | null; percent: string | null };
type Period = {
  start: string;
  end: string;
  days: number;
  complete: boolean;
  loaded_dates: string[];
  missing_dates: string[];
  partial_days: PartialDay[];
  reviewed: boolean;
  totals: Totals;
  reconciliation_issues: NonNullable<Sales["reconciliation_issues"]>;
};
type Trend = { current: Period; previous: Period };
type Restaurant = {
  department_id: string;
  department: string;
  totals: Totals;
  previous_totals: Totals;
  changes: Record<Metric, Change>;
};
type Dish = {
  dish_id: string | null;
  dish_name: string | null;
  revenue: string;
  quantity: string | null;
  previous_revenue: string | null;
  change: Change;
};
export type OverviewData = {
  live?: Sales["live"];
  current: Period;
  previous: Period;
  changes: Record<Metric, Change>;
  trend: Trend[];
  trends: Record<string, Trend[]>;
  restaurants: Restaurant[];
  top_dishes: Dish[];
  dish_current: Period;
  dish_previous: Period;
};
const range = (p: { start: string; end: string }) =>
  p.start === p.end
    ? dateText(p.start)
    : `${dateText(p.start)} — ${dateText(p.end)}`;
const percent = (value: string | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
        Number(value),
      ) + "%";
const signed = (value: string, suffix = "%") =>
  (Number(value) > 0 ? "+" : "") +
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    Number(value),
  ) +
  suffix;
const changeTitle = (v: Change, previous: string | null, currency = true) =>
  `Предыдущий период: ${currency ? money(previous) : number(previous)}${currency && previous !== null ? " ₽" : ""}. Изменение: ${currency ? money(v.absolute) : number(v.absolute)}${currency && v.absolute !== null ? " ₽" : ""}.`;
function Delta({
  value,
  previous,
  inverse = false,
  currency = true,
}: {
  value: Change;
  previous: string | null;
  inverse?: boolean;
  currency?: boolean;
}) {
  const numeric = Number(value.percent);
  const direction =
    value.percent === null || numeric === 0
      ? "neutral"
      : numeric > 0 !== inverse
        ? "positive"
        : "negative";
  return (
    <span
      className={`overview-delta ${direction}`}
      title={changeTitle(value, previous, currency)}
    >
      {value.percent !== null
        ? signed(value.percent)
        : value.absolute === null
          ? "Нет данных для сравнения"
          : "База ≤ 0 · без %"}
    </span>
  );
}
function PeriodNotice({
  period,
  previous = false,
}: {
  period: Period;
  previous?: boolean;
}) {
  const issues = period.reconciliation_issues;
  if (period.complete && !issues.length) return null;
  return (
    <Alert
      color="orange"
      title={previous ? "Период сравнения" : "Полнота данных"}
      role="status"
      mb="md"
    >
      {!period.complete && (
        <div>
          За {range(period)} загружено {period.loaded_dates.length} из{" "}
          {period.days} дней.{" "}
          {previous
            ? "Сравнение за весь период недоступно."
            : "Общие итоги за период недоступны. На графике остаются загруженные интервалы."}
          <details>
            <summary>Незагруженные дни</summary>
            {period.missing_dates.map(dateText).join(", ")}
          </details>
        </div>
      )}
      {issues.length > 0 && (
        <details>
          <summary>
            Расхождения контрольной сверки: {issues.length}. Суммы сохранены как
            в iiko.
          </summary>
          <ul>
            {issues.slice(0, 20).map((v, i) => (
              <li key={i}>
                {dateText(v.date)} · {v.department ?? "Ресторан"} · {v.report} ·{" "}
                {v.field}: {number(v.daily)} / {number(v.actual)}, разница{" "}
                {number(v.delta)}.
              </li>
            ))}
          </ul>
          {issues.length > 20 && "Показаны первые 20 расхождений."}
        </details>
      )}
      <Link to="/status">Статус загрузок</Link>
    </Alert>
  );
}
const metrics: {
  key: Metric;
  label: string;
  icon: typeof IconChartBar;
  color: string;
  note: string;
}[] = [
  {
    key: "revenue",
    label: "Выручка",
    icon: IconCurrencyRubel,
    color: "cyan",
    note: "Сумма после скидок",
  },
  {
    key: "cost",
    label: "Себестоимость",
    icon: IconChartDonut,
    color: "purple",
    note: "Доля от выручки",
  },
  {
    key: "gross_profit",
    label: "Валовая прибыль",
    icon: IconCoins,
    color: "green",
    note: "Валовая маржа",
  },
  {
    key: "average_check",
    label: "Средний чек",
    icon: IconUsers,
    color: "green",
    note: "Выручка / количество чеков",
  },
];
function Kpis({ data, compare }: { data: OverviewData; compare: boolean }) {
  const t = data.current.totals;
  return (
    <>
      <div className="kpi-grid overview-kpis">
        {metrics.map((k) => (
          <Link
            key={k.key}
            to="/sales?kind=daily"
            className="kpi-card"
            aria-label={`${k.label} — открыть расшифровку`}
          >
            <div className="kpi-top">
              <span>{k.label}</span>
              <span className={`kpi-icon ${k.color}`}>
                <k.icon size={19} />
              </span>
            </div>
            <strong>{t[k.key] === null ? "—" : `${money(t[k.key])} ₽`}</strong>
            {compare && (
              <Delta
                value={data.changes[k.key]}
                previous={data.previous.totals[k.key]}
                inverse={k.key === "cost"}
              />
            )}
            <small>
              {k.key === "average_check"
                ? `${money(t.guests_per_day)} гостей в день`
                : k.note}
              {k.key === "cost"
                ? `: ${percent(t.cost_share)}`
                : k.key === "gross_profit"
                  ? `: ${percent(t.margin)}`
                  : ""}
              {compare &&
                ["cost", "gross_profit"].includes(k.key) &&
                (() => {
                  const diff =
                    data.changes[k.key === "cost" ? "cost_share" : "margin"]
                      .absolute;
                  return diff === null ? "" : ` (${signed(diff, " п.п.")})`;
                })()}
            </small>
          </Link>
        ))}
      </div>
    </>
  );
}
const trendLabels: Record<string, string> = {
  revenue: "Выручка",
  cost: "Себестоимость",
  guests: "Гости",
  average_check: "Средний чек",
};
function last30CompletedDays() {
  // Business dates follow Crimea time even when the browser is in another zone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Simferopol",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  const today = Date.UTC(
    Number(part("year")),
    Number(part("month")) - 1,
    Number(part("day")),
  );
  const day = 86_400_000;
  return {
    start: new Date(today - 30 * day).toISOString().slice(0, 10),
    end: new Date(today - day).toISOString().slice(0, 10),
  };
}
function TrendChart({
  data,
  compare,
  grain,
  onGrain,
  onOpen,
  metric,
  setMetric,
}: {
  data: OverviewData;
  compare: boolean;
  grain: string;
  onGrain: (v: string) => void;
  onOpen: (p: Period) => void;
  metric: Metric;
  setMetric: (v: Metric) => void;
}) {
  const [active, setActive] = useState(0);
  const moneyMetric = metric !== "guests";
  const format = (v: string | null) =>
    (moneyMetric ? money(v) : number(v)) +
    (moneyMetric && v !== null ? " ₽" : "");
  const current = data.trend.map((p) => p.current.totals[metric]);
  const previous = data.trend.map((p) => p.previous.totals[metric]);
  const points = [...current, ...(compare ? previous : [])]
    .filter((v): v is string => v !== null)
    .map(Number);
  const labelStep = Math.max(1, Math.ceil(current.length / 8));
  const low = Math.min(0, ...points),
    high = Math.max(1, ...points);
  const x = (i: number) =>
    current.length === 1 ? 502 : 78 + (i * 848) / (current.length - 1);
  const y = (v: string | number) =>
    166 - ((Number(v) - low) / (high - low)) * 144;
  const path = (values: (string | null)[]) =>
    values
      .map((v, i) =>
        v === null
          ? ""
          : `${i && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`,
      )
      .join(" ");
  const area = (values: (string | null)[]) => {
    const segments: string[] = [];
    let start = 0;
    while (start < values.length) {
      if (values[start] === null) {
        start++;
        continue;
      }
      let end = start;
      while (end + 1 < values.length && values[end + 1] !== null) end++;
      segments.push(
        `M${x(start)},${y(0)} ` +
          values
            .slice(start, end + 1)
            .map((v, index) => `L${x(start + index)},${y(v!)}`)
            .join(" ") +
          ` L${x(end)},${y(0)} Z`,
      );
      start = end + 1;
    }
    return segments.join(" ");
  };
  const selected = data.trend[Math.min(active, data.trend.length - 1)];
  const display = (p: Period) =>
    !p.complete
      ? "Не все дни загружены"
      : p.totals[metric] === null
        ? "Нет значений в отчёте"
        : format(p.totals[metric]);
  const compact = (v: number) =>
    new Intl.NumberFormat("ru-RU", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  const exportRows = data.trend.map((p) => ({
    start: p.current.start,
    end: p.current.end,
    value: p.current.totals[metric],
    complete: p.current.complete,
    ...(compare
      ? {
          previous_start: p.previous.start,
          previous_end: p.previous.end,
          previous_value: p.previous.totals[metric],
          previous_complete: p.previous.complete,
        }
      : {}),
  }));
  return (
    <section className="panel overview-trend">
      <div className="panel-heading">
        <div>
          <h2>Динамика ключевых показателей</h2>
          <p className="overview-trend-period">
            Последние 30 завершённых дней · {range(data.current)}
          </p>
        </div>
        <SegmentedControl
          aria-label="Шаг графика"
          size="xs"
          value={grain}
          onChange={onGrain}
          data={[
            { value: "day", label: "Дни" },
            { value: "week", label: "Недели" },
            { value: "month", label: "Месяцы" },
          ]}
        />
      </div>
      <div className="overview-chart-tools">
        <SegmentedControl
          aria-label="Показатель графика"
          size="xs"
          value={metric}
          onChange={(v) => {
            setMetric(v as Metric);
            setActive(0);
          }}
          data={Object.entries(trendLabels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <button
          className="inline-link"
          onClick={() =>
            csv(
              `dynamics-${metric}-${data.current.start}`,
              [
                { key: "start", label: "Начало" },
                { key: "end", label: "Конец" },
                { key: "value", label: trendLabels[metric] },
                { key: "complete", label: "Все дни загружены" },
                ...(compare
                  ? [
                      { key: "previous_start", label: "Начало сравнения" },
                      { key: "previous_end", label: "Конец сравнения" },
                      { key: "previous_value", label: "Предыдущий период" },
                      {
                        key: "previous_complete",
                        label: "Сравнение: все дни загружены",
                      },
                    ]
                  : []),
              ],
              exportRows,
            )
          }
        >
          <IconDownload size={15} /> CSV графика
        </button>
      </div>
      {(!data.current.complete ||
        data.current.partial_days.length > 0 ||
        data.current.reconciliation_issues.length > 0 ||
        (compare &&
          (!data.previous.complete ||
            data.previous.partial_days.length > 0 ||
            data.previous.reconciliation_issues.length > 0))) && (
        <details className="overview-trend-quality">
          <summary>
            Данные графика: загружено {data.current.loaded_dates.length} из{" "}
            {data.current.days} дней.{" "}
            {!data.current.complete
              ? "Незагруженные дни показаны пропусками."
              : "Есть предварительные данные или расхождения в одном из периодов."}
          </summary>
          <PeriodNotice period={data.current} />
          <PartialDayNotice days={data.current.partial_days} />
          {compare && (
            <>
              <PeriodNotice period={data.previous} previous />
              <PartialDayNotice days={data.previous.partial_days} />
            </>
          )}
        </details>
      )}
      <div className="overview-chart-legend">
        <span>
          <i />
          Выбранный период
        </span>
        {compare && (
          <span>
            <i className="previous" />
            Предыдущий период
          </span>
        )}
      </div>
      {selected && (
        <div className="overview-chart-value" aria-live="polite">
          <span>
            {range(selected.current)}{" "}
            <strong>{display(selected.current)}</strong>
          </span>
          {compare && (
            <span>
              {range(selected.previous)}{" "}
              <strong>{display(selected.previous)}</strong>
            </span>
          )}
        </div>
      )}
      <svg
        viewBox="0 0 960 210"
        className="overview-chart"
        role="group"
        aria-label={`Динамика: ${trendLabels[metric]}. Выберите точку, чтобы открыть исходные строки.`}
      >
        <title>
          {trendLabels[metric]} за {range(data.current)}
        </title>
        <defs>
          <linearGradient id="overview-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#43d6ad" stopOpacity=".3" />
            <stop offset="100%" stopColor="#43d6ad" stopOpacity=".01" />
          </linearGradient>
        </defs>
        <path
          d={area(current)}
          fill="url(#overview-area-fill)"
          aria-hidden="true"
        />
        {Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4).map(
          (v, i) => (
            <g key={i} aria-hidden="true">
              <line
                x1="78"
                x2="926"
                y1={y(v)}
                y2={y(v)}
                className="overview-grid-line"
              />
              <text x="65" y={y(v) + 4} textAnchor="end">
                {compact(v)}
              </text>
            </g>
          ),
        )}
        {compare && (
          <path
            d={path(previous)}
            className="overview-series previous"
            aria-hidden="true"
          />
        )}
        <path
          d={path(current)}
          className="overview-series"
          aria-hidden="true"
        />
        {data.trend.map((p, i) => (
          <g
            key={p.current.start}
            role="link"
            tabIndex={0}
            className="overview-point"
            aria-label={`${range(p.current)}: ${display(p.current)}${compare ? `. Сравнение ${range(p.previous)}: ${display(p.previous)}` : ""}. Открыть расшифровку.`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => onOpen(p.current)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(p.current);
              }
            }}
          >
            <rect
              x={x(i) - (current.length === 1 ? 50 : 424 / current.length)}
              y="12"
              width={current.length === 1 ? 100 : 848 / current.length}
              height="162"
              className="overview-hit"
            />
            {compare && previous[i] !== null && (
              <circle
                cx={x(i)}
                cy={y(previous[i]!)}
                r="3"
                className="overview-dot previous"
              />
            )}
            {current[i] !== null ? (
              <circle
                cx={x(i)}
                cy={y(current[i]!)}
                r={i === active ? 5 : 3}
                className="overview-dot"
              />
            ) : (
              <text x={x(i)} y="183" textAnchor="middle">
                —
              </text>
            )}
            {((i % labelStep === 0 && current.length - 1 - i >= labelStep) ||
              i === current.length - 1) && (
              <text x={x(i)} y="202" textAnchor="middle">
                {dateText(p.current.start).slice(0, 5)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <details className="overview-chart-table">
        <summary>Расшифровка и метод расчёта</summary>
        <p className="chart-note">
          {grain === "day"
            ? "Нажмите на день для расшифровки."
            : "Недели начинаются в понедельник, месяцы — с первого числа. Крайние интервалы ограничены выбранными датами."}{" "}
          {compare &&
            "Сравнение — с такими же по длительности интервалами предыдущего периода."}{" "}
          Пробел в линии означает отсутствие данных. Средний чек рассчитывается
          из выручки и числа чеков.
        </p>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Период</th>
                <th>{trendLabels[metric]}</th>
                {compare && (
                  <>
                    <th>Период сравнения</th>
                    <th>{trendLabels[metric]}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.trend.map((p) => (
                <tr key={p.current.start}>
                  <td>
                    <button
                      className="inline-link"
                      onClick={() => onOpen(p.current)}
                    >
                      {range(p.current)}
                    </button>
                  </td>
                  <td>{display(p.current)}</td>
                  {compare && (
                    <>
                      <td>{range(p.previous)}</td>
                      <td>{display(p.previous)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
export function Overview() {
  const w = useWorkspace();
  const navigate = useNavigate();
  const [grain, setGrain] = useState("day");
  const [metric, setMetric] = useState<Metric>("revenue");
  const [comparison, setComparison] = useState("previous");
  const [selectedPrice, setSelectedPrice] = useState<PriceChange | null>(null);
  const compare = comparison === "previous";
  const [trendPeriod] = useState(last30CompletedDays);
  const trendParams = new URLSearchParams(w.query());
  trendParams.set("start", trendPeriod.start);
  trendParams.set("end", trendPeriod.end);
  const samePeriod = w.start === trendPeriod.start && w.end === trendPeriod.end;
  const recent = useData<OverviewData>(
    samePeriod ? null : "/overview?" + trendParams.toString(),
  );
  const state = useData<OverviewData>("/overview?" + w.query(true));
  const prices = useData<PriceReport>(
    "/purchase-prices?" +
      w.query() +
      "&kind=unlinked&exclude_household=true&recent_only=true",
  );
  const data =
    state.data?.current.start === w.start && state.data.current.end === w.end
      ? { ...state.data, trend: state.data.trends[grain] }
      : null;
  const recentData = samePeriod ? data : recent.data;
  const trendData =
    recentData?.current.start === trendPeriod.start &&
    recentData.current.end === trendPeriod.end
      ? { ...recentData, trend: recentData.trends[grain] }
      : null;
  const trendState = samePeriod ? state : recent;
  const openPeriod = (p: Period) => {
    w.setPeriod(p.start, p.end);
    navigate("/sales?kind=daily");
  };
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Simferopol",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const greeting =
    hour < 6
      ? "Доброй ночи"
      : hour < 12
        ? "Доброе утро"
        : hour < 18
          ? "Добрый день"
          : "Добрый вечер";
  function download() {
    if (!data) return;
    csv(
      `overview-${w.start}-${w.end}`,
      [
        { key: "department", label: "Ресторан" },
        { key: "period", label: "Период" },
        { key: "complete", label: "Период загружен полностью" },
        { key: "revenue", label: "Выручка, ₽" },
        { key: "cost", label: "Себестоимость, ₽" },
        { key: "gross_profit", label: "Валовая прибыль, ₽" },
        { key: "margin", label: "Маржа, %" },
        { key: "guests", label: "Гости" },
        { key: "checks", label: "Чеки" },
        { key: "average_check", label: "Средний чек, ₽" },
        ...(compare
          ? [
              { key: "previous_period", label: "Период сравнения" },
              { key: "previous_revenue", label: "Предыдущая выручка, ₽" },
              { key: "revenue_delta", label: "Изменение выручки, %" },
            ]
          : []),
      ],
      data.restaurants.map((r) => ({
        department: r.department,
        period: range(data.current),
        complete: data.current.complete,
        ...Object.fromEntries(
          Object.entries(r.totals).map(([key, v]) => [
            key,
            v === null ? null : money(v),
          ]),
        ),
        ...(compare
          ? {
              previous_period: range(data.previous),
              previous_revenue:
                r.previous_totals.revenue === null
                  ? null
                  : money(r.previous_totals.revenue),
              revenue_delta:
                r.changes.revenue.percent === null
                  ? null
                  : money(r.changes.revenue.percent),
            }
          : {}),
      })),
    );
  }
  return (
    <>
      <OverviewPortal target="overview-toolbar">
        <span className="overview-compare-label">Сравнить с</span>
        <Select
          aria-label="Сравнить с"
          value={comparison}
          onChange={(v) => setComparison(v ?? "previous")}
          size="xs"
          data={[
            { value: "previous", label: "Предыдущий период" },
            { value: "none", label: "Без сравнения" },
          ]}
        />
        <a
          className="overview-bell"
          href="#overview-notifications"
          aria-label="Важные уведомления"
        >
          <IconBell size={19} />
        </a>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={15} />}
          onClick={download}
          disabled={!data || state.loading}
        >
          Скачать отчёт
        </Button>
      </OverviewPortal>
      <OverviewPortal target="overview-notifications">
        <OverviewNotifications
          data={data}
          loading={state.loading || (!data && !state.error)}
          error={state.error}
          prices={prices}
          onPrice={setSelectedPrice}
        />
      </OverviewPortal>
      <header className="overview-greeting">
        <h1>
          {greeting}, {w.meta.user.display_name}!
        </h1>
        <p>
          Вот что происходит в ваших ресторанах ·{" "}
          {range({ start: w.start, end: w.end })}
        </p>
      </header>
      <Feedback
        state={{ ...state, loading: state.loading || (!data && !state.error) }}
      >
        {data && (
          <>
            <LiveDataNotice source={data.live} onRefresh={state.reload} />
            {(!data.current.complete ||
              data.current.partial_days.length > 0 ||
              data.current.reconciliation_issues.length > 0 ||
              (compare &&
                (!data.previous.complete ||
                  data.previous.partial_days.length > 0 ||
                  data.previous.reconciliation_issues.length > 0))) && (
              <details className="overview-quality">
                <summary>
                  <span className="status-dot amber" />
                  {!data.current.complete
                    ? `Продажи: загружено ${data.current.loaded_dates.length} из ${data.current.days} дней. Итоги недоступны.`
                    : data.current.partial_days.length
                      ? "Итоги предварительные."
                      : data.current.reconciliation_issues.length
                        ? "В продажах есть расхождения контрольной сверки."
                        : "В периоде сравнения есть пропуски, предварительные данные или расхождения."}{" "}
                  <span>Подробнее</span>
                </summary>
                <PeriodNotice period={data.current} />
                <PartialDayNotice days={data.current.partial_days} />
                {compare && (
                  <PartialDayNotice days={data.previous.partial_days} />
                )}
                {compare && <PeriodNotice period={data.previous} previous />}
              </details>
            )}
            <Kpis data={data} compare={compare} />
            <Feedback
              state={{
                ...trendState,
                loading:
                  trendState.loading || (!trendData && !trendState.error),
              }}
            >
              {trendData && (
                <TrendChart
                  key={trendParams.toString() + grain}
                  data={trendData}
                  compare={compare}
                  grain={grain}
                  onGrain={setGrain}
                  onOpen={openPeriod}
                  metric={metric}
                  setMetric={setMetric}
                />
              )}
            </Feedback>
            <div className="overview-bottom">
              <section className="panel overview-restaurants">
                <div className="panel-heading">
                  <h2>Рестораны</h2>
                  <Link to="/sales?kind=daily" className="text-link">
                    Все рестораны <IconArrowRight size={14} />
                  </Link>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ресторан</th>
                        <th className="numeric">Выручка, ₽</th>
                        <th className="numeric">
                          {compare ? "Себест., Δ" : "Себест., ₽"}
                        </th>
                        <th className="numeric">Маржа</th>
                        <th className="numeric">Гости</th>
                        <th>Данные</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.restaurants.map((r) => {
                        const discrepancy =
                          data.current.reconciliation_issues.some(
                            (issue) =>
                              !issue.department_id ||
                              issue.department_id === r.department_id,
                          );
                        const status =
                          !data.current.complete || r.totals.revenue === null
                            ? "Неполные"
                            : data.current.partial_days.length
                              ? "Предварит."
                              : discrepancy
                                ? "Расхождения"
                                : "Сверено";
                        return (
                          <tr key={r.department_id}>
                            <td>
                              <button
                                className="inline-link"
                                onClick={() => {
                                  w.setDepartment(r.department_id);
                                  navigate("/sales?kind=daily");
                                }}
                              >
                                <IconChartBar size={13} />
                                <span>{r.department}</span>
                                <IconArrowUpRight size={12} />
                              </button>
                            </td>
                            <td className="numeric strong">
                              {money(r.totals.revenue)}
                            </td>
                            <td className="numeric">
                              {compare ? (
                                <Delta
                                  value={r.changes.cost}
                                  previous={r.previous_totals.cost}
                                  inverse
                                />
                              ) : (
                                money(r.totals.cost)
                              )}
                            </td>
                            <td className="numeric">
                              {percent(r.totals.margin)}
                            </td>
                            <td className="numeric">
                              {number(r.totals.guests)}
                            </td>
                            <td>
                              <Link
                                to={
                                  status === "Сверено" || discrepancy
                                    ? "/sales?kind=daily"
                                    : "/status"
                                }
                                onClick={() => w.setDepartment(r.department_id)}
                                className="overview-data-status"
                                title="Результат загрузки и контрольной сверки продаж"
                              >
                                <i
                                  className={
                                    status === "Сверено" ? "" : "amber"
                                  }
                                />
                                {status}
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!data.restaurants.length && (
                  <p className="section-note">
                    Нет строк по доступным заведениям за выбранные периоды.
                  </p>
                )}
                <p className="overview-top-note">
                  Статус относится к полноте данных и контрольной сверке продаж.
                </p>
              </section>
              <div className="overview-leaders">
                <section className="panel overview-dish-leaders">
                  <div className="panel-heading">
                    <h2>Топ-5 позиций по выручке</h2>
                    <Link to="/sales?kind=dishes" className="text-link">
                      Все <IconArrowRight size={14} />
                    </Link>
                  </div>
                  {!data.dish_current.complete ? (
                    <p className="section-note">
                      Загружено {data.dish_current.loaded_dates.length} из{" "}
                      {data.dish_current.days} дней. Рейтинг появится после
                      загрузки всего периода.
                    </p>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Блюдо</th>
                            <th className="numeric">Выручка, ₽</th>
                            {compare && <th className="numeric">Δ</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {data.top_dishes.map((d, i) => (
                            <tr key={d.dish_id ?? d.dish_name ?? i}>
                              <td>
                                <Link
                                  className="text-link"
                                  to={
                                    "/sales?" +
                                    new URLSearchParams({
                                      kind: "dishes",
                                      ...(d.dish_id
                                        ? { dish_id: d.dish_id }
                                        : { dish_name: d.dish_name ?? "" }),
                                    })
                                  }
                                >
                                  <span className="overview-rank">{i + 1}</span>
                                  <span className="overview-dish-icon">
                                    <IconChefHat size={13} />
                                  </span>
                                  <span>{d.dish_name || "Без названия"}</span>
                                </Link>
                              </td>
                              <td className="numeric strong">
                                {money(d.revenue)}
                              </td>
                              {compare && (
                                <td className="numeric">
                                  <Delta
                                    value={d.change}
                                    previous={d.previous_revenue}
                                  />
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {data.dish_current.complete && !data.top_dishes.length && (
                    <p className="section-note">
                      Нет продаж для выбранных условий.
                    </p>
                  )}
                  <p className="overview-top-note">
                    Позиции iiko, включая напитки и услуги. Выручка после
                    скидок.
                    {compare && !data.dish_previous.complete
                      ? " Сравнение недоступно: предыдущий период загружен не полностью."
                      : ""}
                  </p>
                </section>
                <PriceLeaders prices={prices} onOpen={setSelectedPrice} />
              </div>
            </div>
            <p className="overview-coverage">
              <span
                className={`status-dot ${data.current.complete ? "" : "amber"}`}
              />{" "}
              {data.current.loaded_dates.length} из {data.current.days} дней
              загружено{compare ? ` · сравнение с ${range(data.previous)}` : ""}{" "}
              · {number(data.current.totals.checks)} чеков
            </p>
          </>
        )}
      </Feedback>
      <OverviewPriceModal
        row={selectedPrice}
        scope={w.query()}
        onClose={() => setSelectedPrice(null)}
      />
    </>
  );
}

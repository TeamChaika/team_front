import { useState, type ReactNode } from "react";
import { PartialDayNotice } from "./PartialDayNotice";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Loader,
  TextInput,
  SegmentedControl,
  Select,
  Modal,
} from "@mantine/core";
import {
  IconSearch,
  IconDownload,
  IconArrowLeft,
  IconArrowUpRight,
  IconRefresh,
  IconChartBar,
  IconReceipt,
  IconCurrencyRubel,
  IconChevronRight,
} from "@tabler/icons-react";
import {
  type Row,
  type Column,
  type PageData,
  type Sales,
  type SalesRow,
  money,
  number,
  dateText,
  csv,
} from "./api";
import { useData } from "./useData";
import { useWorkspace } from "./App";
import { DiscountDrilldown } from "./DiscountDrilldown";
import { LiveDataNotice } from "./LiveDataNotice";
import { EmployeeEditor, EmployeePending } from "./EmployeeEditor";
export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function Feedback({
  state,
  children,
}: {
  state: { loading: boolean; error: string; reload: () => void };
  children: ReactNode;
}) {
  if (state.loading)
    return (
      <div className="loading">
        <Loader size="sm" /> Загружаем данные…
      </div>
    );
  if (state.error)
    return (
      <Alert color="red" title="Не удалось загрузить" role="alert">
        {state.error}
        <div>
          <Button mt="sm" size="xs" variant="light" onClick={state.reload}>
            Повторить
          </Button>
        </div>
      </Alert>
    );
  return <>{children}</>;
}
function Empty({
  text = "По выбранным условиям данных нет.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <IconSearch size={28} />
      <h3>Ничего не найдено</h3>
      <p>{text}</p>
    </div>
  );
}
const currencyKeys = new Set([
  "writeoff_sum",
  "price",
  "sum",
  "cost",
  "revenue",
  "discount",
  "return_sum",
  "event_sum",
  "order_sum_after_discount",
  "pay_orders",
  "sales_cash",
  "sales_card",
  "sales_credit",
  "session_start_cash",
  "sum_writeoff_orders",
  "pay_in",
  "pay_out",
  "pay_income",
  "cash_remain",
  "cash_diff",
]);
const numberKeys = new Set([
  "amount",
  "actual_amount",
  "amount_in",
  "amount_middle",
  "amount_out",
  "checks",
  "guests",
  "quantity",
  "days",
]);
const statusLabels: Record<string, string> = {
  PROCESSED: "Проведён",
  NEW: "Новый",
  DELETED: "Удалён",
  succeeded: "Завершено",
  failed: "Ошибка",
  running: "В работе",
  GOODS: "Товар",
  DISH: "Блюдо",
  PREPARED: "Заготовка",
  MODIFIER: "Модификатор",
  SERVICE: "Услуга",
};
function cell(key: string, value: unknown): ReactNode {
  if (value === null || value === undefined || value === "")
    return <span className="muted">—</span>;
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (key === "mapping_state") {
    const labels: Record<string, string> = {
      matched: "Сопоставлено",
      missing: "Нет связи",
      ambiguous: "Неоднозначная связь",
      unknown_department: "Неизвестный ресторан",
    };
    return labels[String(value)] ?? String(value);
  }
  if (["open_date", "close_date", "accept_date"].includes(key)) {
    // iiko supplies local wall time without a timezone; never convert using the viewer's zone.
    const [day, time] = String(value).split(/[ T]/);
    return (
      <span className="table-date">
        {day.split("-").reverse().join(".") +
          (time ? " " + time.slice(0, 8) : "")}
      </span>
    );
  }
  if (currencyKeys.has(key))
    return <span className="numeric">{money(value)}</span>;
  if (numberKeys.has(key))
    return <span className="numeric">{number(value)}</span>;
  if (
    [
      "date",
      "business_date",
      "date_from",
      "date_to",
      "observed_at",
      "last_seen_at",
      "started_at",
      "finished_at",
      "accounting_timestamp",
      "next_retry_at",
    ].includes(key)
  )
    return <span className="table-date">{dateText(value)}</span>;
  if (key === "status")
    return (
      <Badge
        variant="light"
        color={
          value === "failed"
            ? "red"
            : value === "running"
              ? "blue"
              : value === "DELETED"
                ? "gray"
                : "teal"
        }
      >
        {statusLabels[String(value)] ?? String(value)}
      </Badge>
    );
  return key === "type"
    ? (statusLabels[String(value)] ?? String(value))
    : String(value);
}
export function DataTable({
  columns,
  rows,
  firstLink,
  sort,
  footer,
}: {
  columns: Column[];
  rows: Row[];
  firstLink?: (r: Row) => string | null;
  sort?: {
    key: string;
    direction: "asc" | "desc";
    keys: string[];
    onChange: (key: string) => void;
  };
  footer?: Row;
}) {
  if (!rows.length) return <Empty />;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sort?.keys.includes(c.key)
                    ? sort.key === c.key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined
                }
                className={
                  currencyKeys.has(c.key) || numberKeys.has(c.key)
                    ? "numeric"
                    : ""
                }
              >
                {sort?.keys.includes(c.key) ? (
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => sort.onChange(c.key)}
                    aria-label={`${c.label}: ${sort.key === c.key && sort.direction === "desc" ? "по возрастанию" : "по убыванию"}`}
                  >
                    {c.label}
                    <span aria-hidden="true">
                      {sort.key === c.key
                        ? sort.direction === "desc"
                          ? "↓"
                          : "↑"
                        : "↕"}
                    </span>
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? r.ordinal ?? i) + "-" + i}>
              {columns.map((c, j) => (
                <td
                  key={c.key}
                  className={
                    currencyKeys.has(c.key) || numberKeys.has(c.key)
                      ? "numeric"
                      : ""
                  }
                >
                  {j === 0 && firstLink?.(r) ? (
                    <Link className="table-link" to={firstLink(r)!}>
                      {cell(c.key, r[c.key])}
                      <IconArrowUpRight size={13} />
                    </Link>
                  ) : (
                    cell(c.key, r[c.key])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {columns.map((c, index) =>
                index === 0 ? (
                  <th key={c.key} scope="row">
                    {cell(c.key, footer[c.key])}
                  </th>
                ) : (
                  <td
                    key={c.key}
                    className={
                      currencyKeys.has(c.key) || numberKeys.has(c.key)
                        ? "numeric"
                        : ""
                    }
                  >
                    {cell(c.key, footer[c.key])}
                  </td>
                ),
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
export function ExportButton({
  name,
  columns,
  rows,
  label = "CSV",
}: {
  name: string;
  columns: Column[];
  rows: Row[];
  label?: string;
}) {
  return (
    <Button
      variant="default"
      size="xs"
      disabled={!rows.length}
      leftSection={<IconDownload size={14} />}
      onClick={() => csv(name, columns, rows)}
    >
      {label}
    </Button>
  );
}
const salesNames: Record<string, string> = {
  daily: "По ресторанам",
  dishes: "Блюда",
  payments: "Способы оплаты",
  discounts: "Скидки",
  returns: "Возвраты",
  waiters: "Официанты",
  hours: "По часам",
};
function ReviewNotice({ data }: { data: Sales }) {
  const days =
    Math.round((Date.parse(data.end) - Date.parse(data.start)) / 86400000) + 1;
  if (!data.complete) {
    return (
      <Alert
        color="orange"
        title="Недостаточно данных за выбранный период"
        role="status"
      >
        Загружено {data.loaded_dates.length} из {days} дней. Итоги за{" "}
        {dateText(data.start)} — {dateText(data.end)} не рассчитаны.
        <div>Не загружены: {data.missing_dates.map(dateText).join(", ")}.</div>
        <div>
          Сохранённые строки доступны в расшифровке.{" "}
          <Link to="/status">Статус данных</Link>
        </div>
      </Alert>
    );
  }
  if (data.reconciliation_issues?.length) {
    const fields: Record<string, string> = {
      DishDiscountSumInt: "Выручка",
      "ProductCostBase.ProductCost": "Себестоимость",
      UniqOrderId: "Чеки",
      GuestNum: "Гости",
    };
    return (
      <Alert
        color="orange"
        title="Есть расхождения между отчётами"
        role="status"
      >
        Все {data.loaded_dates.length} дней загружены. Суммы сохранены как в
        iiko; контрольная сверка выявила расхождения (
        {data.reconciliation_issues.length}).
        <details>
          <summary>Показать расхождения</summary>
          <ul>
            {data.reconciliation_issues.slice(0, 20).map((issue, index) => (
              <li key={index}>
                {dateText(issue.date)} · {issue.department || "Ресторан"} ·{" "}
                {salesNames[issue.report]} ·{" "}
                {fields[issue.field] || "Показатель"}: дневной отчёт{" "}
                {number(issue.daily)}, этот отчёт {number(issue.actual)},
                разница {number(issue.delta)}.
              </li>
            ))}
          </ul>
          {data.reconciliation_issues.length > 20 && (
            <p>Показаны первые 20 расхождений.</p>
          )}
        </details>
      </Alert>
    );
  }
  return (
    <div className="data-notice">
      <span className="status-dot amber" />
      <span>
        {!data.rows.length
          ? "Нет строк OLAP для выбранных условий."
          : data.rows.some((r) => !r.reviewed)
            ? "Контрольные суммы совпадают между отчётами. Сверка с вашими отчётами iiko ожидается."
            : "Данные согласованы."}{" "}
        Дней с данными: {data.loaded_dates.length} из {days}.{" "}
      </span>
    </div>
  );
}
function Kpis({ data }: { data: Sales }) {
  const t = data.totals;
  return (
    <div className="kpi-grid">
      {[
        {
          label: "Выручка",
          value: money(t.revenue) + " ₽",
          note: "Сумма после скидок",
          icon: IconCurrencyRubel,
          color: "cyan",
        },
        {
          label: "Себестоимость продаж",
          value: money(t.cost) + " ₽",
          note: "По данным OLAP iiko",
          icon: IconChartBar,
          color: "purple",
        },
        {
          label: "Валовая прибыль",
          value: money(t.gross_profit) + " ₽",
          note: "Выручка − себестоимость",
          icon: IconArrowUpRight,
          color: "green",
        },
        {
          label: "Средний чек",
          value: money(t.average_check) + " ₽",
          note: number(t.checks) + " чеков · " + number(t.guests) + " гостей",
          icon: IconReceipt,
          color: "orange",
        },
      ].map((k) => (
        <Link
          to={k.color === "purple" ? "/sales?kind=dishes" : "/sales?kind=daily"}
          className="kpi-card"
          key={k.label}
          aria-label={k.label + " — открыть расшифровку"}
        >
          <div className="kpi-top">
            <span>{k.label}</span>
            <span className={"kpi-icon " + k.color}>
              <k.icon size={19} />
            </span>
          </div>
          <strong>{t.revenue === null ? "—" : k.value}</strong>
          <small>
            {data.complete ? k.note : "Итог за период недоступен"} · ↗
          </small>
        </Link>
      ))}
    </div>
  );
}
function HoursChart({ data }: { data: Sales }) {
  const [metric, setMetric] = useState("guests");
  const labels: Record<string, string> = {
    guests: "Гости",
    checks: "Чеки",
    revenue: "Выручка",
  };
  const values = new Map(data.hourly.map((h) => [Number(h.hour), h]));
  const maximum = Math.max(
    ...data.hourly.map((h) => Number(h[metric as "guests"])),
    1,
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Когда приходят гости</h2>
          <p>По часу открытия заказа · {labels[metric].toLowerCase()}</p>
        </div>
        <SegmentedControl
          size="xs"
          value={metric}
          onChange={setMetric}
          data={Object.entries(labels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      {data.hourly.length ? (
        <>
          <div
            className="hour-chart"
            role="img"
            aria-label={
              "Распределение по часу открытия заказа: " +
              data.hourly
                .map((h) => `${h.hour}:00 — ${h[metric as "guests"]}`)
                .join(", ")
            }
          >
            {Array.from({ length: 24 }, (_, hour) => {
              const h = values.get(hour);
              const value = h ? Number(h[metric as "guests"]) : null;
              return (
                <div className="hour-column" key={hour}>
                  <div className="bar-track">
                    <div
                      className={
                        "hour-bar " + (value === null ? "no-data" : "")
                      }
                      style={{
                        height:
                          value === null
                            ? "2px"
                            : Math.max((value / maximum) * 100, 1) + "%",
                      }}
                      title={`${hour}:00 · ${value === null ? "нет строки в отчёте" : metric === "revenue" ? money(value) + " ₽" : number(value) + " " + labels[metric].toLowerCase()}`}
                    >
                      <span>
                        {value === null
                          ? "—"
                          : metric === "revenue"
                            ? money(value)
                            : number(value)}
                      </span>
                    </div>
                  </div>
                  <small>{String(hour).padStart(2, "0")}</small>
                </div>
              );
            })}
          </div>
          <p className="chart-note">
            00–23 часа · наведите на столбец для значения. Прочерк означает
            отсутствие строки в отчёте.
          </p>
        </>
      ) : (
        <Empty
          text={
            data.complete
              ? "За выбранный период нет строк по часам."
              : "Для диаграммы нужны данные за все дни выбранного периода."
          }
        />
      )}
    </section>
  );
}
function salesTable(
  kind: string,
  rows: SalesRow[],
): { columns: Column[]; rows: Row[] } {
  const extra: Record<string, [string, string][]> = {
    daily: [],
    dishes: [["DishName", "Блюдо"]],
    payments: [
      ["PayTypes.Group", "Группа оплаты"],
      ["PayTypes", "Тип оплаты"],
    ],
    discounts: [["ItemSaleEventDiscountType", "Скидка"]],
    returns: [["Storned", "Возврат"]],
    waiters: [["OrderWaiter.Name", "Официант"]],
    hours: [["HourOpen", "Час открытия"]],
  };
  let fields = ["revenue"];
  if (["daily", "dishes", "hours"].includes(kind)) fields.push("cost");
  if (["daily", "waiters", "hours", "returns"].includes(kind))
    fields.push("checks");
  if (["daily", "waiters", "hours"].includes(kind)) fields.push("guests");
  if (kind === "dishes") fields.push("quantity");
  if (["discounts", "returns"].includes(kind)) fields.push("discount");
  if (kind === "returns") fields.push("return_sum");
  const names: Record<string, string> = {
    revenue: "Выручка, ₽",
    cost: "Себестоимость, ₽",
    checks: "Чеки",
    guests: "Гости",
    quantity: "Количество",
    discount: "Скидки, ₽",
    return_sum: "Возвраты, ₽",
  };
  const mapped: Row[] = rows.map((r) => ({
    ...r,
    ...r.dimensions,
    ...Object.fromEntries(
      extra[kind].map(([k]) => [k, r.dimensions[k] ?? "Не указано"]),
    ),
  }));
  if (kind === "payments")
    mapped.sort(
      (a, b) =>
        String(a["PayTypes.Group"]).localeCompare(
          String(b["PayTypes.Group"]),
        ) || String(a["PayTypes"]).localeCompare(String(b["PayTypes"])),
    );
  if (kind === "hours")
    mapped.sort((a, b) => Number(a.HourOpen) - Number(b.HourOpen));
  return {
    columns: [
      { key: "department", label: "Ресторан" },
      { key: "business_date", label: "Дата" },
      ...extra[kind].map(([key, label]) => ({ key, label })),
      ...fields.map((key) => ({ key, label: names[key] })),
    ],
    rows: mapped,
  };
}
function DiscountDepartment({
  group,
  rows,
}: {
  group: NonNullable<Sales["discount_groups"]>[number];
  rows: SalesRow[];
}) {
  const [open, setOpen] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const table = salesTable("discounts", rows);
  const columns = [
    { key: "ItemSaleEventDiscountType", label: "Скидка" },
    ...table.columns.filter(
      (c) => !["department", "ItemSaleEventDiscountType"].includes(c.key),
    ),
  ];
  return (
    <details
      className="discount-department"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <IconChevronRight
          size={18}
          className="discount-chevron"
          aria-hidden="true"
        />
        <span className="discount-department-name">
          <strong>{group.department || "Заведение без названия"}</strong>
          <small>Строк: {number(rows.length)}</small>
        </span>
        <span className="discount-department-total">
          <small>Выручка со скидками</small>
          <strong>{money(group.totals.revenue)} ₽</strong>
        </span>
        <span className="discount-department-total">
          <small>Сумма скидок</small>
          <strong>{money(group.totals.discount)} ₽</strong>
        </span>
      </summary>
      {open && (
        <>
          <DataTable
            columns={columns}
            rows={allRows ? table.rows : table.rows.slice(0, 100)}
            firstLink={(row) =>
              "/sales?" +
              new URLSearchParams({
                kind: "discounts",
                row: String(row.report_id) + ":" + row.ordinal,
              })
            }
          />
          {rows.length > 100 && (
            <div className="table-footer">
              <span>
                Показано {allRows ? rows.length : 100} из {rows.length}
              </span>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setAllRows((value) => !value)}
              >
                {allRows ? "Первые 100 строк" : "Показать все скидки заведения"}
              </Button>
            </div>
          )}
        </>
      )}
    </details>
  );
}

export function SalesPage() {
  const w = useWorkspace(),
    [params, setParams] = useSearchParams();
  const kind = salesNames[params.get("kind") ?? ""]
    ? params.get("kind")!
    : "daily";
  const dishFilter = new URLSearchParams();
  if (kind === "dishes") {
    for (const key of ["dish_id", "dish_name"]) {
      if (params.has(key)) dishFilter.set(key, params.get(key)!);
    }
  }
  const state = useData<Sales>(
    "/sales/" + kind + "?" + w.query(true) + "&" + dishFilter,
  );
  const [expanded, setExpanded] = useState(false);
  const selectedRow = state.data?.rows.find(
    (r) => r.report_id + ":" + r.ordinal === params.get("row"),
  );
  const table = state.data
    ? salesTable(kind, state.data.rows)
    : { columns: [], rows: [] };
  return (
    <>
      <PageTitle
        title="Продажи"
        subtitle="Семь согласованных между собой разрезов OLAP. Час открытия и группа → тип оплаты."
      />
      <div className="tabs" role="tablist" aria-label="Отчёты продаж">
        {Object.entries(salesNames).map(([k, title]) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            className={kind === k ? "selected" : ""}
            onClick={() => {
              setParams({ kind: k });
              setExpanded(false);
            }}
          >
            {title}
          </button>
        ))}
      </div>
      <Feedback state={state}>
        {state.data && (
          <>
            <ReviewNotice data={state.data} />
            {state.data.live ? (
              <LiveDataNotice
                source={state.data.live}
                onRefresh={state.reload}
              />
            ) : (
              <PartialDayNotice days={state.data.partial_days} />
            )}
            <Modal
              opened={Boolean(selectedRow)}
              onClose={() => {
                const next = new URLSearchParams(params);
                next.delete("row");
                setParams(next);
              }}
              title={
                kind === "discounts"
                  ? "Скидка: заказы и позиции"
                  : "Исходная строка OLAP"
              }
              closeButtonProps={{ "aria-label": "Закрыть строку отчёта" }}
              size="xl"
            >
              {selectedRow && (
                <>
                  <DataTable
                    columns={table.columns}
                    rows={salesTable(kind, [selectedRow]).rows}
                  />
                  {kind === "discounts" && !selectedRow.live && (
                    <DiscountDrilldown
                      key={`${selectedRow.report_id}:${selectedRow.ordinal}`}
                      anchor={selectedRow}
                    />
                  )}
                  {kind === "discounts" && selectedRow.live && (
                    <p className="section-note">
                      Сегодняшний срез получен напрямую из iiko. Детализация до
                      заказов будет доступна после сохранения дневного отчёта.
                    </p>
                  )}
                  <p className="section-note">
                    Получено: {dateText(selectedRow.observed_at)}. Отчёт:{" "}
                    {selectedRow.report_id}, строка {selectedRow.ordinal + 1}.
                  </p>
                  <details className="provenance">
                    <summary>Точные значения и параметры запроса</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          dimensions: selectedRow.dimensions,
                          revenue: selectedRow.revenue,
                          cost: selectedRow.cost,
                          checks: selectedRow.checks,
                          guests: selectedRow.guests,
                          request: selectedRow.request,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </>
              )}
            </Modal>
            {kind === "dishes" && dishFilter.size > 0 && (
              <div className="data-notice">
                <span>
                  Выбрано блюдо:{" "}
                  {String(
                    state.data.rows[0]?.dimensions.DishName ??
                      params.get("dish_name") ??
                      params.get("dish_id"),
                  )}
                </span>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => setParams({ kind })}
                >
                  Все блюда
                </Button>
              </div>
            )}
            {kind === "daily" && <Kpis data={state.data} />}
            <div className="report-summary">
              <span>
                {kind === "discounts" ? "Выручка со скидками" : "Выручка"}{" "}
                <strong>{money(state.data.totals.revenue)} ₽</strong>
              </span>
              {kind === "discounts" && (
                <span>
                  Скидки <strong>{money(state.data.totals.discount)} ₽</strong>
                </span>
              )}
              {kind === "returns" && (
                <span>
                  Возвраты{" "}
                  <strong>{money(state.data.totals.return_sum)} ₽</strong>
                </span>
              )}
              <span>{number(state.data.rows.length)} строк</span>
            </div>
            {kind === "hours" && <HoursChart data={state.data} />}
            <section className="panel">
              <div className="panel-heading">
                <h2>{salesNames[kind]}</h2>
                <ExportButton
                  name={"sales-" + kind + "-" + w.start}
                  columns={table.columns}
                  rows={table.rows}
                />
              </div>
              {["payments", "discounts"].includes(kind) && (
                <p className="section-note">
                  Один чек может входить в несколько групп. Количество чеков
                  здесь не суммируем.
                </p>
              )}
              {kind === "discounts" && (
                <p className="section-note">
                  Раскройте заведение и нажмите на скидку, чтобы посмотреть
                  заказы.
                </p>
              )}
              {kind === "returns" && (
                <p className="section-note">
                  Возвраты показаны отдельно. Повторно вычитать их из выручки
                  нельзя без проверки правила отчёта.
                </p>
              )}
              {kind === "discounts" ? (
                state.data.rows.length ? (
                  state.data.discount_groups?.map((group) => (
                    <DiscountDepartment
                      key={w.query(true) + ":" + group.department_id}
                      group={group}
                      rows={state.data!.rows.filter(
                        (row) => row.department_id === group.department_id,
                      )}
                    />
                  ))
                ) : (
                  <Empty />
                )
              ) : kind === "payments" ? (
                state.data.payment_groups?.map((group) => (
                  <div key={group.group ?? "empty"}>
                    <div className="payment-group">
                      <strong>
                        {(
                          {
                            CASH: "Наличные",
                            CARD: "Банковские карты",
                            NON_CASH: "Безналичный расчёт",
                          } as Record<string, string>
                        )[group.group ?? ""] ??
                          group.group ??
                          "Без группы оплаты"}
                      </strong>
                      <span>{money(group.totals.revenue)} ₽</span>
                    </div>
                    <DataTable
                      columns={table.columns.filter(
                        (c) => c.key !== "PayTypes.Group",
                      )}
                      rows={salesTable(kind, group.rows).rows}
                      firstLink={(r) =>
                        "/sales?" +
                        new URLSearchParams({
                          kind,
                          row: String(r.report_id) + ":" + r.ordinal,
                        })
                      }
                    />
                  </div>
                ))
              ) : (
                <DataTable
                  columns={table.columns}
                  rows={expanded ? table.rows : table.rows.slice(0, 100)}
                  firstLink={(r) =>
                    "/sales?" +
                    new URLSearchParams({
                      ...Object.fromEntries(dishFilter),
                      kind,
                      row: String(r.report_id) + ":" + r.ordinal,
                    })
                  }
                />
              )}
              {kind !== "discounts" && table.rows.length > 100 && (
                <div className="table-footer">
                  <span>
                    Показано {expanded ? table.rows.length : 100} из{" "}
                    {table.rows.length}
                  </span>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? "Свернуть" : "Показать все строки"}
                  </Button>
                </div>
              )}
            </section>
            <details className="panel provenance">
              <summary>Источник и параметры расчёта</summary>
              <p>
                Строки сохранены из OLAP iiko; для этого разреза отдельные чеки
                не выгружались. Источник доступен до строки отчёта.
              </p>
              <DataTable
                columns={[
                  { key: "business_date", label: "Дата" },
                  { key: "observed_at", label: "Получено" },
                  { key: "report_id", label: "Идентификатор отчёта" },
                ]}
                rows={[
                  ...new Map(
                    state.data.rows.map((r) => [r.report_id, r]),
                  ).values(),
                ]}
              />
            </details>
          </>
        )}
      </Feedback>
    </>
  );
}
const dateResources = new Set([
  "cash-shifts",
  "invoices",
  "outgoing",
  "transfers",
  "writeoffs",
  "events",
]);
export function ResourcePage({
  resource,
  title,
}: {
  resource: string;
  title: string;
}) {
  const w = useWorkspace();
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [offset, setOffset] = useState(0);
  const base = w.query(dateResources.has(resource));
  const [status, setStatus] = useState<string | null>(null);
  const effectiveOffset = offset;
  const state = useData<PageData>(
    "/resources/" +
      resource +
      "?" +
      base +
      "&q=" +
      encodeURIComponent(q) +
      "&offset=" +
      effectiveOffset +
      (status ? "&status=" + status : ""),
  );
  const [previous, setPrevious] = useState(base);
  if (previous !== base) {
    setPrevious(base);
    setOffset(0);
  }
  const descriptions: Record<string, string> = {
    "cash-shifts":
      "Смены по дате открытия, время iiko. Оплаты и движения наличных — отдельные показатели; их нельзя автоматически приравнивать к выручке OLAP.",
    invoices:
      "Приходы от поставщиков. Откройте документ, чтобы увидеть позиции.",
    outgoing: "Расходные накладные, включая передачу между заведениями.",
    transfers:
      "Движение товаров между складами. Доступны документы с участием вашего ресторана.",
    writeoffs: "Акты списания и их товарные позиции.",
    products:
      "Общий каталог сети. Сейчас доступен сохранённый снимок номенклатуры.",
    charts:
      "Доступные технологические карты сети. Полная история версий будет добавлена отдельно.",
    balances:
      "Последний загруженный снимок остатков. Момент учёта указан в каждой строке.",
    employees:
      "Сотрудники и основные должности. Привязка к ресторанам берётся из iiko.",
    events:
      "Действия с заказами из RMS. Нажмите на время события, чтобы открыть связи заказа.",
  };
  function link(r: Row) {
    if (resource === "events") {
      if (!r.title) return null;
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Simferopol",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(String(r.date).replace(" ", "T")));
      return (
        "/events/topology?" +
        new URLSearchParams({
          source_id: String(r.source_id),
          day,
          order_number: String(r.title),
        })
      );
    }
    return "/" + (resource === "balances" ? "products" : resource) + "/" + r.id;
  }
  return (
    <>
      <PageTitle
        title={title}
        subtitle={descriptions[resource]}
        action={
          resource === "employees" ? (
            <EmployeeEditor onSaved={state.reload} />
          ) : undefined
        }
      />
      {resource === "employees" && <EmployeePending />}
      {dateResources.has(resource) && (
        <p className="section-note">
          Запрошен период: {dateText(w.start)} — {dateText(w.end)}
        </p>
      )}
      {dateResources.has(resource) &&
        !["events", "cash-shifts"].includes(resource) && (
          <div className="data-notice">
            <span className="status-dot" />
            Период фильтрует учётные дни выгрузки iiko. Дата самого документа
            показана в таблице.
          </div>
        )}
      {resource === "balances" && (
        <div className="data-notice">
          Снимок: {dateText(w.meta.balance_dates[0])}. Фильтр периода к этому
          разделу не применяется.
        </div>
      )}
      {["products", "charts", "employees"].includes(resource) && (
        <p className="section-note">
          Фильтр периода не применяется к справочнику.
          {resource === "employees" && w.departments.length > 0
            ? " Сотрудники без подтверждённой привязки к выбранным ресторанам скрыты."
            : ""}
        </p>
      )}
      <section className="panel">
        <div className="resource-tools">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQ(search);
              setOffset(0);
            }}
          >
            <TextInput
              aria-label={resource === "events" ? "Номер заказа" : "Поиск"}
              placeholder={
                resource === "events"
                  ? "Номер заказа…"
                  : resource === "employees"
                    ? "Имя, табельный номер, должность…"
                    : "Номер, название, контрагент…"
              }
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              leftSection={<IconSearch size={16} />}
            />
            <Button type="submit" variant="light">
              Найти
            </Button>
          </form>
          {dateResources.has(resource) &&
            !["events", "cash-shifts"].includes(resource) && (
              <Select
                aria-label="Статус документа"
                placeholder="Все статусы"
                clearable
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setOffset(0);
                }}
                data={[
                  { value: "PROCESSED", label: "Проведён" },
                  { value: "NEW", label: "Новый" },
                  { value: "DELETED", label: "Удалён" },
                ]}
                w={155}
              />
            )}
          <ExportButton
            name={resource + "-" + w.start}
            columns={state.data?.columns ?? []}
            rows={state.data?.rows ?? []}
            label="CSV страницы"
          />
        </div>
        <Feedback state={state}>
          {state.data && (
            <>
              <DataTable
                columns={state.data.columns}
                rows={state.data.rows}
                firstLink={link}
              />
              <div className="table-footer">
                <span>
                  {number(state.data.total)} записей ·{" "}
                  {state.data.total ? offset + 1 : 0}–
                  {offset + state.data.rows.length}
                </span>
                <div>
                  <Button
                    variant="default"
                    size="xs"
                    disabled={offset === 0}
                    onClick={() => setOffset((v) => Math.max(0, v - 50))}
                  >
                    Назад
                  </Button>{" "}
                  <Button
                    variant="default"
                    size="xs"
                    disabled={offset + 50 >= state.data.total}
                    onClick={() => setOffset((v) => v + 50)}
                  >
                    Далее
                  </Button>
                </div>
              </div>
            </>
          )}
        </Feedback>
      </section>
    </>
  );
}
const headerNames: Record<string, string> = {
  title: "Название / номер",
  writeoff_sum: "Общая сумма списания, ₽",
  date: "Дата документа",
  status: "Статус",
  store: "Склад",
  destination: "На склад",
  counterparty: "Контрагент",
  last_seen_at: "Последняя загрузка",
  num: "Артикул",
  code: "Код",
  type: "Тип",
  category: "Группа",
  unit: "Единица измерения",
  price: "Цена продажи, ₽",
  deleted: "Удалён в iiko",
  present_in_latest: "Есть в последней выгрузке",
  date_from: "Действует с",
  date_to: "Действует до",
  amount: "Выход",
  role: "Основная должность",
  phone: "Телефон",
  cell_phone: "Мобильный телефон",
  email: "Email",
  restaurant: "Ресторан",
  point_of_sale_name: "Точка продаж",
  open_date: "Открыта (время iiko)",
  close_date: "Закрыта (время iiko)",
  accept_date: "Принята (время iiko)",
  session_status: "Статус iiko",
  fiscal_number: "Фискальный номер",
  cash_reg_number: "Номер кассы",
  cash_reg_serial: "Серийный номер кассы",
  manager: "Менеджер",
  cashier: "Кассир",
  pay_orders: "Сумма заказов после скидок, ₽",
  sales_cash: "Наличные оплаты, ₽",
  sales_card: "Оплаты картой, ₽",
  sales_credit: "Продажи в кредит, ₽",
  session_start_cash: "Наличные на начало, ₽",
  sum_writeoff_orders: "За счёт заведения, ₽",
  pay_in: "Внесения, ₽",
  pay_out: "Изъятия в течение смены, ₽",
  pay_income: "Изъятие при закрытии (знак iiko), ₽",
  cash_remain: "Остаток наличных, ₽",
  cash_diff: "Расхождение учёта и факта, ₽",
  mapping_state: "Связь с рестораном",
};
export function DetailPage({ resource }: { resource: string }) {
  const w = useWorkspace(),
    { id } = useParams();
  const state = useData<{
    header: Row;
    items: Row[];
    columns: Column[];
    provenance: Row | null;
  }>("/resources/" + resource + "/" + id + "?" + w.query());
  return (
    <>
      <Link className="back-link" to={"/" + resource}>
        <IconArrowLeft size={16} /> Назад к списку
      </Link>
      {resource === "employees" && id && (
        <EmployeeEditor id={id} onSaved={state.reload} />
      )}
      <Feedback state={state}>
        {state.data && (
          <>
            <PageTitle
              title={String(state.data.header.title ?? "Документ")}
              subtitle={"Идентификатор iiko: " + id}
            />
            {resource === "cash-shifts" && (
              <p className="section-note">
                Связь с рестораном определена по справочнику точек продаж на
                момент загрузки. «За счёт заведения» относится к заказам. Время
                закрытия и принятия могут различаться.
              </p>
            )}
            <section className="panel detail-header">
              {Object.entries(headerNames)
                .filter(([k]) => k in state.data!.header)
                .map(([k, label]) => (
                  <div key={k}>
                    <small>{label}</small>
                    <strong>{cell(k, state.data!.header[k])}</strong>
                  </div>
                ))}
            </section>
            {state.data.items.length > 0 && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Состав · {state.data.items.length} позиций</h2>
                  <ExportButton
                    name={resource + "-" + id}
                    columns={state.data.columns}
                    rows={state.data.items}
                  />
                </div>
                <DataTable
                  columns={state.data.columns}
                  rows={state.data.items}
                  firstLink={(r) =>
                    r.product_id ? "/products/" + r.product_id : null
                  }
                />
                {resource === "writeoffs" && (
                  <div className="table-footer">
                    <strong>
                      Общая сумма списания:{" "}
                      {money(state.data.header.writeoff_sum)} ₽
                    </strong>
                    {state.data.header.writeoff_sum == null && (
                      <span>В iiko не указана стоимость части позиций.</span>
                    )}
                  </div>
                )}
              </section>
            )}
            {typeof state.data.header.technology === "string" && (
              <section className="panel prose">
                <h2>Технология приготовления</h2>
                <p>{state.data.header.technology}</p>
              </section>
            )}
            <details className="panel provenance">
              <summary>Источник документа</summary>
              <p>
                Запись iiko сохранена в Supabase вместе с исходным ответом.
                Точность сумм и повторяющиеся строки документа сохранены.
              </p>
              {state.data.provenance ? (
                <dl>
                  {Object.entries(state.data.provenance).map(([k, v]) => (
                    <div key={k}>
                      <dt>
                        {(
                          {
                            id: "Снимок",
                            resource: "Источник",
                            observed_at: "Получено",
                            sha256: "Контрольная сумма SHA-256",
                            groups_snapshot_id: "Снимок групп и точек продаж",
                            groups_observed_at: "Справочник получен",
                            groups_sha256: "SHA-256 справочника",
                          } as Record<string, string>
                        )[k] ?? k}
                      </dt>
                      <dd>{k === "observed_at" ? dateText(v) : String(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>Сведения об исходном снимке отсутствуют.</p>
              )}
            </details>
          </>
        )}
      </Feedback>
    </>
  );
}
export function StatusPage() {
  const w = useWorkspace();
  const state = useData<{
    events: Row[];
    runs: Row[];
    observations: Row[];
    cash_shift_days: Row[];
    scheduled?: Row[];
  }>("/status?" + w.query());
  return (
    <>
      <PageTitle
        title="Статус данных"
        subtitle="Фактическое покрытие событий и последние сохранённые наблюдения."
        action={
          <Button
            variant="default"
            leftSection={<IconRefresh size={15} />}
            onClick={state.reload}
          >
            Обновить
          </Button>
        }
      />
      <Feedback state={state}>
        {state.data && (
          <>
            {!!state.data.scheduled?.length && (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Автоматическая синхронизация</h2>
                    <p>
                      Время расписания: Крым, UTC+3. При ошибке — повтор через 5
                      минут.
                    </p>
                  </div>
                </div>
                <DataTable
                  columns={[
                    { key: "label", label: "Задача" },
                    { key: "schedule", label: "Расписание" },
                    { key: "status", label: "Статус" },
                    { key: "finished_at", label: "Завершено" },
                    { key: "error_code", label: "Ошибка" },
                    { key: "next_retry_at", label: "Повтор" },
                  ]}
                  rows={state.data.scheduled}
                />
              </section>
            )}
            <section className="panel">
              <div className="panel-heading">
                <h2>События ресторанов</h2>
                <Badge variant="light">{state.data.events.length} RMS</Badge>
              </div>
              <DataTable
                columns={[
                  { key: "restaurant", label: "Ресторан" },
                  { key: "date_from", label: "Первый день" },
                  { key: "date_to", label: "Последний день" },
                  { key: "days", label: "Загружено дней" },
                  { key: "observed_at", label: "Последняя загрузка" },
                ]}
                rows={state.data.events}
              />
            </section>
            <section className="panel prose">
              <h2>Доступность аналитики</h2>
              <p>
                OLAP:{" "}
                {w.meta.sales_dates.map(dateText).join(", ") ||
                  "нет загруженных дней"}
                . Статус согласования указан в отчётах.
              </p>
              <p>
                Остатки — снимок на {dateText(w.meta.balance_dates[0])}.
                Номенклатура и техкарты пока представлены доступными снимками,
                без полной истории.
              </p>
              <p>
                Далее по плану: архивная номенклатура и история техкарт →
                инвентаризации.
              </p>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Кассовые смены · дни открытия</h2>
              </div>
              <DataTable
                columns={[
                  { key: "date", label: "День открытия" },
                  { key: "shifts", label: "Смен в доступных данных" },
                  { key: "observed_at", label: "Последняя загрузка" },
                ]}
                rows={state.data.cash_shift_days}
              />
            </section>
            {state.data.runs.length > 0 && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Последние задания</h2>
                </div>
                <DataTable
                  columns={[
                    { key: "job", label: "Задание" },
                    { key: "status", label: "Статус" },
                    { key: "started_at", label: "Начало" },
                    { key: "finished_at", label: "Завершение" },
                    { key: "error_code", label: "Ошибка" },
                  ]}
                  rows={state.data.runs}
                />
              </section>
            )}
            {state.data.observations.length > 0 && (
              <details className="panel provenance">
                <summary>Последние наблюдения по источникам</summary>
                <DataTable
                  columns={[
                    { key: "resource", label: "Ресурс" },
                    { key: "observed_at", label: "Получено" },
                  ]}
                  rows={state.data.observations}
                />
              </details>
            )}
          </>
        )}
      </Feedback>
    </>
  );
}
type Node = { id: string; kind: string; label: string; details: Row };
type Edge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  evidence_event_ids: string[];
};
type Topology = {
  source_id: string;
  root_order_id: string;
  nodes: Node[];
  edges: Edge[];
  transfers: Row[];
  event_count: number;
  limitations: string[];
};
export function TopologyPage() {
  const w = useWorkspace(),
    [p] = useSearchParams();
  const state = useData<Topology>(
    "/topology?" + p.toString() + "&" + w.query(),
  );
  const [selected, setSelected] = useState("");
  const selectedNode = state.data?.nodes.find((n) => n.id === selected);
  const actions =
    state.data?.nodes.filter(
      (n) =>
        n.kind === "action" &&
        (!selectedNode ||
          (selectedNode.kind === "order"
            ? (n.details.fields as Row)?.orderId ===
              selectedNode.details.order_id
            : (
                selectedNode.details.event_ids as string[] | undefined
              )?.includes(String(n.details.event_id)))),
    ) ?? [];
  return (
    <>
      <Link className="back-link" to="/events">
        <IconArrowLeft size={16} /> К журналу событий
      </Link>
      <PageTitle
        title={"Связи заказа №" + (p.get("order_number") ?? "")}
        subtitle={"RMS: " + p.get("source_id") + " · " + dateText(p.get("day"))}
      />
      <Feedback state={state}>
        {state.data && (
          <>
            <div className="data-notice">
              {state.data.event_count} событий ·{" "}
              {state.data.nodes.filter((n) => n.kind === "order").length}{" "}
              заказов. Связи построены по сохранённым событиям iiko.
            </div>
            <OrderGraph data={state.data} onSelect={setSelected} />
            {selectedNode && (
              <section className="panel prose">
                <h2>{selectedNode.label}</h2>
                {selectedNode.kind === "transfer" && (
                  <TransferInfo
                    transfer={selectedNode.details}
                    nodes={state.data.nodes}
                  />
                )}
                <p>Ниже показаны связанные действия: {actions.length}.</p>
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => setSelected("")}
                >
                  Показать все действия
                </Button>
              </section>
            )}
            <section className="panel">
              <div className="panel-heading">
                <h2>Переносы позиций</h2>
              </div>
              {state.data.transfers.length ? (
                state.data.transfers.map((t, i) => (
                  <details className="transfer-item" key={i}>
                    <summary>
                      Перенос {i + 1} ·{" "}
                      {(
                        {
                          matched: "подтверждён",
                          ambiguous: "неоднозначное сопоставление",
                          unmatched: "парное событие не найдено",
                        } as Record<string, string>
                      )[String(t.status)] ?? "сведения из событий"}
                    </summary>
                    <TransferInfo transfer={t} nodes={state.data!.nodes} />
                    <details className="provenance">
                      <summary>Свидетельства и сопоставление</summary>
                      <pre>{JSON.stringify(t, null, 2)}</pre>
                    </details>
                  </details>
                ))
              ) : (
                <p className="section-note">
                  Подтверждённых переносов в доступных событиях не найдено.
                </p>
              )}
            </section>
            <EventTimeline
              nodes={actions}
              allNodes={state.data.nodes}
              edges={state.data.edges}
            />
            {state.data.limitations.length > 0 && (
              <Alert color="gray" title="Границы данных">
                {state.data.limitations.map((x, i) => (
                  <p key={i}>
                    {x
                      .replace("dishes_text", "состав переноса")
                      .replace("later_in_time", "Связь «позже по времени»")}
                  </p>
                ))}
              </Alert>
            )}
          </>
        )}
      </Feedback>
    </>
  );
}
function OrderGraph({
  data,
  onSelect,
}: {
  data: Topology;
  onSelect: (id: string) => void;
}) {
  const orders = data.nodes.filter((n) => n.kind === "order"),
    transfers = data.nodes.filter((n) => n.kind === "transfer");
  const nodes = [...orders, ...transfers];
  const positions = new Map(
    nodes.map((n, i) => [
      n.id,
      {
        x: n.kind === "order" ? 40 : 450,
        y: 40 + (n.kind === "order" ? i : i - orders.length) * 110,
      },
    ]),
  );
  const height = Math.max(orders.length, transfers.length, 1) * 110 + 40;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Топология заказов</h2>
          <p>Заказ → перенос позиций → связанный заказ. Нажмите на узел.</p>
        </div>
      </div>
      <div className="graph-scroll">
        <svg
          viewBox={`0 0 790 ${height}`}
          role="img"
          aria-label="Граф подтверждённых связей заказов"
          style={{ minWidth: 650, minHeight: 220, maxHeight: 850 }}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#5fa2c2" />
            </marker>
          </defs>
          {data.edges
            .filter((e) => positions.has(e.source) && positions.has(e.target))
            .map((e) => {
              const a = positions.get(e.source)!,
                b = positions.get(e.target)!;
              const right = a.x < b.x;
              const x1 = a.x + (right ? 250 : 0),
                x2 = b.x + (right ? 0 : 250);
              return (
                <path
                  key={e.id}
                  d={`M${x1},${a.y + 30} C${(x1 + x2) / 2},${a.y + 30} ${(x1 + x2) / 2},${b.y + 30} ${x2},${b.y + 30}`}
                  fill="none"
                  stroke="#5fa2c2"
                  strokeWidth={2}
                  markerEnd="url(#arrow)"
                >
                  <title>
                    {e.kind} · свидетельств: {e.evidence_event_ids.length}
                  </title>
                </path>
              );
            })}
          {nodes.map((n) => {
            const pos = positions.get(n.id)!;
            return (
              <g
                key={n.id}
                transform={`translate(${pos.x},${pos.y})`}
                className="graph-node"
                role="button"
                tabIndex={0}
                aria-label={n.label}
                onClick={() => onSelect(n.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(n.id);
                  }
                }}
              >
                <rect
                  width="250"
                  height="65"
                  rx="10"
                  fill={n.kind === "order" ? "#172c40" : "#242c47"}
                  stroke={
                    n.id.endsWith(data.root_order_id) ? "#31bce4" : "#3f536d"
                  }
                  strokeWidth="1.5"
                />
                <text x="16" y="27" fill="#e0eaf5" fontSize="14">
                  {n.label.slice(0, 30)}
                </text>
                <text x="16" y="48" fill="#8b9db4" fontSize="11">
                  {n.kind === "order" ? "Заказ" : "Подтверждённая операция"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
function EventTimeline({
  nodes,
  allNodes,
  edges,
}: {
  nodes: Node[];
  allNodes: Node[];
  edges: Edge[];
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const labels = [...new Set(nodes.map((n) => n.label))];
  const selected = filter ? nodes.filter((n) => n.label === filter) : nodes;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Хронология действий</h2>
        <Select
          clearable
          searchable
          placeholder="Все действия"
          aria-label="Фильтр действий"
          data={labels}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <div className="timeline">
        {selected.map((n) => (
          <details key={n.id}>
            <summary>
              <span className="timeline-dot" />
              <strong>{n.label}</strong>
              <span>
                {dateText(n.details.occurred_at ?? n.details.timestamp)}
              </span>
            </summary>
            <div className="event-detail">
              <p>Заказ: {String((n.details.fields as Row)?.orderNum ?? "—")}</p>
              <p>
                {edges
                  .filter(
                    (e) =>
                      e.source === n.id &&
                      [
                        "performed_by",
                        "authorized_by",
                        "assigned_waiter",
                        "cashier",
                      ].includes(e.kind),
                  )
                  .map(
                    (e) =>
                      (
                        ({
                          performed_by: "Действие",
                          authorized_by: "Подтвердил",
                          assigned_waiter: "Официант",
                          cashier: "Кассир",
                        }) as Record<string, string>
                      )[e.kind] +
                      ": " +
                      (allNodes.find((a) => a.id === e.target)?.label ??
                        "не указан"),
                  )
                  .join(" · ")}
              </p>
              <FieldsView fields={n.details.fields as Row} />
              <details className="provenance">
                <summary>Исходное событие</summary>
                <pre>{JSON.stringify(n.details, null, 2)}</pre>
              </details>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function FieldsView({ fields }: { fields: Row }) {
  const labels: Record<string, string> = {
    dishes: "Позиции",
    sum: "Сумма, ₽",
    orderSum: "Сумма заказа, ₽",
    orderSumAfterDiscount: "Сумма со скидкой, ₽",
    tableNum: "Стол",
    guestsCount: "Гости",
    reason: "Причина",
    comment: "Комментарий",
    orderNum: "Номер заказа",
    otherOrderNum: "Связанный заказ",
    oldValue: "До изменения",
    newValue: "После изменения",
  };
  return (
    <dl className="event-fields">
      {Object.entries(fields ?? {})
        .filter(([k, v]) => labels[k] && v !== null && v !== "")
        .map(([k, v]) => (
          <div key={k}>
            <dt>{labels[k]}</dt>
            <dd>
              {["sum", "orderSum", "orderSumAfterDiscount"].includes(k)
                ? money(v)
                : String(v)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
function TransferInfo({ transfer, nodes }: { transfer: Row; nodes: Node[] }) {
  const order = (id: unknown) =>
    nodes.find((n) => n.kind === "order" && n.details.order_id === id)?.label ??
    "не установлен";
  return (
    <div className="event-detail">
      <p>
        <strong>
          {order(transfer.from_order_id)} → {order(transfer.to_order_id)}
        </strong>
      </p>
      <p>{String(transfer.dishes_text ?? "Состав не указан")}</p>
      <p>Сумма: {money(transfer.amount)} ₽</p>
      <p className="muted">
        Перенос группы позиций. Идентификаторы отдельных строк iiko в этих
        событиях отсутствуют.
      </p>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Checkbox, Select } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconArrowUpRight, IconDownload } from "@tabler/icons-react";
import { useWorkspace } from "./App";
import { useData } from "./useData";
import { csv, dateText, number } from "./api";
import { Feedback, PageTitle } from "./pages";
import { PurchaseImpact } from "./PurchaseImpact";
import { PurchaseModal } from "./PurchaseModal";
import { price, signed, csvPrice } from "./purchasePriceFormat";
import { priceTimeline, visibleChartLabels } from "./purchasePriceChart";
import { purchaseInvoiceRows, type PurchaseInvoiceRow } from "./purchaseInvoiceHistory";
import { todayReservation } from "./depositDates";
import { useAssistant } from "./AssistantContext";
import {
  canReadPurchaseImpact,
  purchaseImpactNotice,
  waitingForPurchaseImpact,
  purchasePriceFilters,
  purchasePriceReportPath,
  updatePurchasePriceFilters,
  type PurchasePriceFilters,
  type PreparedImpactPeriod,
} from "./purchasePriceReport";
import "./purchase-prices.css";

type SourceLine = {
  document_id: string;
  document_number: string | null;
  num: number;
  num_occurrence: number;
  supplier: string | null;
  store: string;
  department: string | null;
  amount: string;
  sum: string;
  price: string | null;
  last_seen_at: string;
};
type Observation = {
  date: string;
  amount: string;
  sum: string;
  price: string;
  lines: SourceLine[];
};
type InvoiceRow = PurchaseInvoiceRow<SourceLine>;
type Baseline = {
  date_from: string | null;
  date: string | null;
  amount: string;
  sum: string;
  price: string | null;
  count: number;
  receipts: Observation[];
};
export type PriceChange = {
  product_id: string;
  product: string;
  code: string | null;
  store_id: string | null;
  store: string | null;
  scope_label: string;
  department: string | null;
  unit_id: string;
  unit: string;
  linked: boolean;
  current: Observation;
  previous: Baseline;
  delta: string | null;
  percent: string | null;
  impact?: {
    weekly_delta: string | null;
    included_positions: number;
    excluded_positions: number;
    reason: string | null;
  };
};
type Report = {
  kind: string;
  exclude_household: boolean;
  rows: PriceChange[];
  history_size: number;
  recent_only: boolean;
  recent_since: string;
  impact_period?: PreparedImpactPeriod & {
    start: string;
    end: string;
    recipe_day: string | null;
    excluded_department_ids?: string[];
    coverage?: {
      complete: boolean;
      loaded_days: number;
      days: number;
      missing_dates: string[];
      partial_dates: string[];
      mismatch_dates: string[];
    };
  };
  stats: {
    observations: number;
    no_previous: number;
    invalid: number;
    unchanged: number;
    short_history: number;
  };
};
function Percent({ row }: { row: PriceChange }) {
  if (row.delta === null) return <span className="muted">Нет истории</span>;
  return (
    <span
      className={
        Number(row.delta) > 0
          ? "price-rise"
          : Number(row.delta) < 0
            ? "price-fall"
            : "muted"
      }
    >
      {row.percent === null ? "База 0 ₽" : signed(row.percent) + "%"}
    </span>
  );
}
const identity = (r: PriceChange) =>
  [r.product_id, r.store_id, r.unit_id, r.linked, r.current.date].join("/");
const productOrder = new Intl.Collator("ru", { numeric: true });
const emptyRows: PriceChange[] = [];

export function PurchasePrices() {
  const w = useWorkspace();
  const params = new URLSearchParams(w.query());
  params.delete("department_id");
  params.delete("start");
  params.delete("end");
  const impactAllowed = canReadPurchaseImpact(w.meta.warehouse_scope?.mode);
  return (
    <PriceWorkspace
      key={params.toString() + "/" + impactAllowed}
      scope={params.toString()}
      impactAllowed={impactAllowed}
    />
  );
}
function PriceWorkspace({
  scope,
  impactAllowed,
}: {
  scope: string;
  impactAllowed: boolean;
}) {
  const assistant = useAssistant();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    kind,
    exclude_household: excludeHousehold,
    recent_only: recentOnly,
    product,
    direction,
    threshold,
    sort,
    page,
  } = purchasePriceFilters(searchParams);
  function changeFilters(changes: Partial<PurchasePriceFilters>) {
    setSearchParams(
      (previous) => updatePurchasePriceFilters(previous, changes),
      {
        replace: true,
      },
    );
  }
  const reportPath = purchasePriceReportPath(
    scope,
    kind,
    excludeHousehold,
    recentOnly,
    impactAllowed,
  );
  const state = useData<Report>(reportPath, true);
  const matchesFilters = (value: Report | null) =>
    value?.kind === kind &&
    value.exclude_household === excludeHousehold &&
    value.recent_only === recentOnly;
  const report = matchesFilters(state.data) ? state.data : null;
  useEffect(() => {
    if (!report || state.refreshing) return;
    const dayLoaded = todayReservation();
    let lastCheck = Date.now();
    const check = () => {
      if (document.hidden || Date.now() - lastCheck < 120_000) return;
      if (
        state.error || todayReservation() !== dayLoaded ||
        (impactAllowed && waitingForPurchaseImpact(report.impact_period))
      ) {
        lastCheck = Date.now();
        state.reload();
      }
    };
    const timer = window.setInterval(check, 120_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [impactAllowed, report, state.error, state.reload, state.refreshing]);
  const impactNotice = purchaseImpactNotice(
    impactAllowed,
    report?.impact_period,
  );
  const [selected, setSelected] = useState<PriceChange | null>(null);
  const [impact, setImpact] = useState<PriceChange | null>(null);
  function openAssistant(row: PriceChange | null = null) {
    assistant.open(
      {
        product: row
          ? {
              product_id: row.product_id,
              unit_id: row.unit_id,
              linked: row.linked,
            }
          : null,
        kind,
        exclude_household: excludeHousehold,
        recent_only: recentOnly,
        recent_period: "month",
      },
      row?.product ?? null,
    );
  }
  const all = report?.rows ?? emptyRows;
  const historySize = report?.history_size ?? 6;
  const rows = useMemo(
    () =>
      all
        .filter(
          (r) =>
            (!product || r.product_id === product) &&
            (direction === "all" ||
              (r.delta === null
                ? "no_history"
                : Number(r.delta) === 0
                  ? "unchanged"
                  : Number(r.delta) > 0
                    ? "rise"
                    : "fall") === direction) &&
            (threshold === "0" ||
              (r.percent !== null &&
                Math.abs(Number(r.percent)) >= Number(threshold))),
        )
        .sort((a, b) => {
          const dateDifference = b.current.date.localeCompare(a.current.date);
          const byReceipt =
            (sort === "date_asc" ? -dateDifference : dateDifference) ||
            productOrder.compare(a.product, b.product) ||
            identity(a).localeCompare(identity(b));
          if (sort === "date" || sort === "date_asc") return byReceipt;
          if (sort === "weekly_desc" || sort === "weekly_asc") {
            const left = a.impact?.weekly_delta ?? null;
            const right = b.impact?.weekly_delta ?? null;
            if (left === null || right === null)
              return left === right ? byReceipt : left === null ? 1 : -1;
            return (
              (sort === "weekly_asc"
                ? Number(left) - Number(right)
                : Number(right) - Number(left)) || byReceipt
            );
          }
          // A zero baseline has no percentage; keep those rows last in either direction.
          if (a.percent === null || b.percent === null) {
            return a.percent === b.percent
              ? byReceipt
              : a.percent === null
                ? 1
                : -1;
          }
          const left = Number(a.percent);
          const right = Number(b.percent);
          const difference =
            sort === "percent"
              ? Math.abs(right) - Math.abs(left)
              : sort === "percent_asc"
                ? left - right
                : right - left;
          return difference || byReceipt;
        }),
    [all, product, direction, threshold, sort],
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 50)));
  const visible = rows.slice((currentPage - 1) * 50, currentPage * 50);
  const choices = useMemo(
    () =>
      [
        ...new Map(
          all.map((r) => [
            r.product_id,
            {
              value: r.product_id,
              label: r.product + (r.code ? " · " + r.code : ""),
            },
          ]),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label, "ru")),
    [all],
  );
  const counts = useMemo(() => {
    const products = new Set<string>();
    let rises = 0;
    let falls = 0;
    for (const row of rows) {
      products.add(row.product_id);
      const delta = Number(row.delta);
      if (delta > 0) rises++;
      if (delta < 0) falls++;
    }
    return { products: products.size, rises, falls };
  }, [rows]);
  function exportRows() {
    const cols = [
      ["product", "Товар"],
      ["product_id", "UUID товара"],
      ["scope_label", "Охват закупок"],
      ["unit", "Единица"],
      ["date", "Дата поступления"],
      ["history_count", "Предыдущих поступлений в сравнении"],
      ["history_size", "Размер истории для сравнения"],
      ["previous_date_from", "Первое поступление в сравнении"],
      ["previous_date", "Последнее поступление в сравнении"],
      ["old_price", "Средневзвешенная предыдущих поступлений, ₽/ед."],
      ["new_price", "Новая цена, ₽/ед."],
      ["delta", "Изменение, ₽/ед."],
      ["percent", "Изменение, %"],
      ["weekly_delta", "Влияние за неделю, ₽"],
      ["impact_included", "Рассчитанных позиций блюд"],
      ["impact_excluded", "Исключённых позиций блюд"],
      ["impact_reason", "Причина отсутствия расчёта"],
      ["sales_start", "Продажи с"],
      ["sales_end", "Продажи по"],
      ["old_amount", "Общее количество предыдущих поступлений"],
      ["old_sum", "Общая сумма предыдущих поступлений, ₽"],
      ["new_amount", "Новое количество"],
      ["new_sum", "Новая сумма, ₽"],
      ["linked", "Связана с расходной"],
    ].map(([key, label]) => ({ key, label }));
    csv(
      "Изменение закупочных цен",
      cols,
      rows.map((r) => ({
        ...r,
        date: r.current.date,
        history_count: r.previous.count,
        history_size: historySize,
        previous_date_from: r.previous.date_from,
        previous_date: r.previous.date,
        old_price: csvPrice(r.previous.price),
        new_price: csvPrice(r.current.price),
        delta: csvPrice(r.delta),
        percent: csvPrice(r.percent),
        weekly_delta: csvPrice(r.impact?.weekly_delta ?? null),
        impact_included: r.impact?.included_positions,
        impact_excluded: r.impact?.excluded_positions,
        impact_reason: r.impact?.reason,
        sales_start: report?.impact_period?.start,
        sales_end: report?.impact_period?.end,
        old_amount: csvPrice(r.previous.amount),
        old_sum: csvPrice(r.previous.sum),
        new_amount: csvPrice(r.current.amount),
        new_sum: csvPrice(r.current.sum),
        linked: r.linked ? "Да" : "Нет",
      })),
      [
        "old_price",
        "new_price",
        "delta",
        "percent",
        "weekly_delta",
        "old_amount",
        "old_sum",
        "new_amount",
        "new_sum",
      ],
    );
  }
  return (
    <>
      <PageTitle
        title="Изменение закупочных цен"
        subtitle="Цена товара по всей сети: последняя закупка и средняя 6 предыдущих поступлений."
      />
      <div className="price-assistant-launch">
        <Button variant="light" onClick={() => openAssistant()}>
          ИИ-помощник
        </Button>
      </div>
      <div className="data-notice">
        Товар объединён по всем доступным складам сети. Кнопка «Динамика»
        открывает цены и накладные с указанием складов. Разные единицы измерения
        и виды поступлений сравниваются отдельно.
        {report?.recent_only &&
          report.recent_since &&
          ` В списке товары с последним поступлением с ${dateText(report.recent_since)}.`}
      </div>
      <section className="panel">
        <div className="price-household-filter">
          <Checkbox
            label="Были поступления за последний месяц"
            description="На любой склад сети. История предыдущих поступлений сохраняется целиком."
            checked={recentOnly}
            onChange={(event) => {
              changeFilters({
                recent_only: event.currentTarget.checked,
                product: null,
              });
              setSelected(null);
            }}
          />
          <Checkbox
            label="Скрыть хозтовары"
            description="Группа «ХОЗНУЖДЫ» и её подгруппы: хозтовары, хозрасходы, посуда и одноразовая посуда."
            checked={excludeHousehold}
            onChange={(event) => {
              changeFilters({
                exclude_household: event.currentTarget.checked,
                product: null,
              });
              setSelected(null);
            }}
          />
        </div>
        <div className="price-filters">
          <Select
            label="Поступления"
            value={kind}
            onChange={(v) => {
              changeFilters({ kind: v ?? "unlinked", product: null });
              setSelected(null);
            }}
            data={[
              { value: "unlinked", label: "Без связанной расходной" },
              { value: "linked", label: "Со связанной расходной" },
              { value: "all", label: "Все поступления" },
            ]}
          />
          <Select
            label="Номенклатура"
            placeholder="Название или артикул"
            searchable
            clearable
            value={product}
            onChange={(v) => changeFilters({ product: v })}
            data={choices}
            nothingFoundMessage="Товар не найден в поступлениях"
          />
          <Select
            label="Направление"
            value={direction}
            onChange={(v) => changeFilters({ direction: v ?? "all" })}
            data={[
              { value: "all", label: "Все товары" },
              { value: "unchanged", label: "Без изменения" },
              { value: "no_history", label: "Первое поступление" },
              { value: "rise", label: "Подорожало" },
              { value: "fall", label: "Подешевело" },
            ]}
          />
          <Select
            label="Изменение от"
            value={threshold}
            onChange={(v) => changeFilters({ threshold: v ?? "0" })}
            data={[
              { value: "0", label: "Любое" },
              { value: "1", label: "1%" },
              { value: "5", label: "5%" },
              { value: "10", label: "10%" },
            ]}
          />
          <Select
            label="Сортировка"
            value={sort}
            onChange={(v) => changeFilters({ sort: v ?? "date" })}
            data={[
              { value: "date", label: "Сначала последние поступления" },
              { value: "date_asc", label: "Сначала ранние поступления" },
              {
                value: "percent_desc",
                label: "Изменение, %: от большего к меньшему",
              },
              {
                value: "percent_asc",
                label: "Изменение, %: от меньшего к большему",
              },
              {
                value: "weekly_desc",
                label: "За неделю: от большего к меньшему",
              },
              {
                value: "weekly_asc",
                label: "За неделю: от меньшего к большему",
              },
              {
                value: "percent",
                label: "По величине изменения: рост и снижение",
              },
            ]}
          />
        </div>
      </section>
      {report && state.error && (
        <p role="status">
          Не удалось обновить список. Показаны данные последней загрузки.{" "}
          <button type="button" className="text-link" onClick={state.reload}>
            Повторить
          </button>
        </p>
      )}
      <Feedback state={{
        reload: state.reload,
        loading: !report && (state.loading || state.data !== null),
        error: report ? "" : state.error,
      }}>
        {report && (
          <>
            <div className="price-summary" aria-label="Итоги изменений">
              <div>
                <span>Товаров в выборке</span>
                <strong>{counts.products}</strong>
              </div>
              <div>
                <span>Повышений цены</span>
                <strong className="price-rise">{counts.rises}</strong>
              </div>
              <div>
                <span>Снижений цены</span>
                <strong className="price-fall">{counts.falls}</strong>
              </div>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Закупочные цены · {rows.length}</h2>
                  <p>
                    Последняя закупка каждого товара по сети и отклонение от
                    средней предыдущих поступлений.
                  </p>
                  {report?.impact_period?.status === "ready" && (
                    <p>
                      Влияние за неделю — оценка по техкартам и продажам за{" "}
                      {dateText(report.impact_period.start)}–
                      {dateText(report.impact_period.end)}. «+» — рост затрат,
                      «−» — экономия при прежнем темпе продаж. Нажмите сумму,
                      чтобы увидеть расчёт по блюдам.
                      {!!report.impact_period.excluded_department_ids?.length &&
                        " В расчёте — заведения с включённой синхронизацией."}
                      {report.impact_period.coverage?.complete &&
                        report.impact_period.target_end &&
                        report.impact_period.end <
                          report.impact_period.target_end &&
                        " Более свежий период появится автоматически после проверки продаж."}
                    </p>
                  )}
                  {impactNotice && <p role="status">{impactNotice}</p>}
                  {report?.impact_period?.coverage &&
                    !report.impact_period.coverage.complete && (
                      <p role="status" className="price-rise">
                        Недельный расчёт пока недоступен: проверено{" "}
                        {report.impact_period.coverage.loaded_days} из{" "}
                        {report.impact_period.coverage.days} дней продаж.
                        {report.impact_period.coverage.missing_dates.length >
                          0 && (
                          <>
                            {" "}
                            Не загружены:{" "}
                            {report.impact_period.coverage.missing_dates
                              .map(dateText)
                              .join(", ")}
                            .
                          </>
                        )}
                        {report.impact_period.coverage.partial_dates.length >
                          0 && " Есть незавершённые дни."}
                        {report.impact_period.coverage.mismatch_dates.length >
                          0 && " Есть расхождения при сверке."}{" "}
                        <Link to="/status">Статус загрузок</Link>
                      </p>
                    )}
                </div>
                <Button
                  variant="default"
                  leftSection={<IconDownload size={16} />}
                  disabled={!rows.length}
                  onClick={exportRows}
                >
                  CSV · все найденные
                </Button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Товар / единица</th>
                      <th
                        aria-sort={
                          sort === "date"
                            ? "descending"
                            : sort === "date_asc"
                              ? "ascending"
                              : "none"
                        }
                      >
                        <button
                          type="button"
                          className="price-sort-button"
                          onClick={() =>
                            changeFilters({
                              sort: sort === "date" ? "date_asc" : "date",
                            })
                          }
                          aria-label={
                            sort === "date"
                              ? "Сначала ранние поступления"
                              : "Сначала последние поступления"
                          }
                        >
                          Последнее поступление{" "}
                          <span aria-hidden="true">
                            {sort === "date"
                              ? "↓"
                              : sort === "date_asc"
                                ? "↑"
                                : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="numeric">Средняя предыдущих, ₽/ед.</th>
                      <th className="numeric">Цена поступления, ₽/ед.</th>
                      <th className="numeric">Разница, ₽/ед.</th>
                      <th
                        className="numeric"
                        aria-sort={
                          sort === "percent_desc"
                            ? "descending"
                            : sort === "percent_asc"
                              ? "ascending"
                              : "none"
                        }
                      >
                        <button
                          type="button"
                          className="price-sort-button"
                          onClick={() =>
                            changeFilters({
                              sort:
                                sort === "percent_desc"
                                  ? "percent_asc"
                                  : "percent_desc",
                            })
                          }
                          aria-label={
                            sort === "percent_desc"
                              ? "Изменение: сортировать от меньшего к большему"
                              : "Изменение: сортировать от большего к меньшему"
                          }
                        >
                          Изменение, %{" "}
                          <span aria-hidden="true">
                            {sort === "percent_desc"
                              ? "↓"
                              : sort === "percent_asc"
                                ? "↑"
                                : "↕"}
                          </span>
                        </button>
                      </th>
                      <th
                        className="numeric"
                        aria-sort={
                          sort === "weekly_desc"
                            ? "descending"
                            : sort === "weekly_asc"
                              ? "ascending"
                              : "none"
                        }
                      >
                        <button
                          type="button"
                          className="price-sort-button"
                          onClick={() =>
                            changeFilters({
                              sort:
                                sort === "weekly_desc"
                                  ? "weekly_asc"
                                  : "weekly_desc",
                            })
                          }
                          aria-label={
                            sort === "weekly_desc"
                              ? "За неделю: сортировать от меньшего к большему"
                              : "За неделю: сортировать от большего к меньшему"
                          }
                        >
                          За неделю, ₽{" "}
                          <span aria-hidden="true">
                            {sort === "weekly_desc"
                              ? "↓"
                              : sort === "weekly_asc"
                                ? "↑"
                                : "↕"}
                          </span>
                        </button>
                      </th>
                      <th>Подробнее</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={identity(r)}>
                        <td>
                          <Link
                            className="text-link"
                            to={"/products/" + r.product_id}
                            state={{
                              purchasePricesSearch: searchParams.toString(),
                            }}
                          >
                            {r.product}
                          </Link>
                          <small className="price-subtext">
                            {r.unit}
                            {r.code ? " · " + r.code : ""}
                            {kind === "all" &&
                              (r.linked
                                ? " · Со связанной расходной"
                                : " · Без связанной расходной")}
                          </small>
                        </td>
                        <td>{dateText(r.current.date)}</td>
                        <td className="numeric">
                          {price(r.previous.price)}
                          <small className="price-subtext">
                            Поступлений: {r.previous.count} из {historySize}
                          </small>
                        </td>
                        <td className="numeric strong">
                          {price(r.current.price)}
                        </td>
                        <td className="numeric">{signed(r.delta)}</td>
                        <td className="numeric">
                          <Percent row={r} />
                          {r.previous.count === 1 &&
                            r.delta !== null &&
                            Number(r.delta) !== 0 && (
                              <button
                                type="button"
                                className="price-sample-link"
                                onClick={() => setSelected(r)}
                                aria-label={
                                  "Сравнение за один день закупок, показать накладные: " +
                                  r.product
                                }
                              >
                                Сравнение за 1 день
                              </button>
                            )}
                        </td>
                        <td className="numeric price-weekly">
                          {impactAllowed ? (
                            <button
                              type="button"
                              className="price-impact-link"
                              onClick={() => setImpact(r)}
                              aria-label={
                                "Расчёт влияния за неделю: " + r.product
                              }
                              title={r.impact?.reason ?? "Расчёт по блюдам"}
                            >
                              <span
                                className={
                                  Number(r.impact?.weekly_delta) > 0
                                    ? "price-rise"
                                    : Number(r.impact?.weekly_delta) < 0
                                      ? "price-fall"
                                      : "muted"
                                }
                              >
                                {signed(r.impact?.weekly_delta ?? null)}
                              </span>
                              <small className="price-subtext">
                                {!r.impact
                                  ? "—"
                                  : r.impact.weekly_delta == null
                                    ? "Нет расчёта"
                                    : `По ${r.impact.included_positions} поз.`}
                              </small>
                              {!!r.impact?.excluded_positions && (
                                <small className="price-subtext">
                                  Исключено: {r.impact.excluded_positions}
                                </small>
                              )}
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="price-actions">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => setSelected(r)}
                              aria-label={"Динамика цен по сети: " + r.product}
                            >
                              Динамика
                            </Button>
                            {impactAllowed && (
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => setImpact(r)}
                                aria-label={
                                  "Блюда и влияние цены: " + r.product
                                }
                              >
                                Блюда и влияние
                              </Button>
                            )}
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => openAssistant(r)}
                              aria-label={"Спросить ИИ: " + r.product}
                            >
                              Спросить ИИ
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <p className="section-note">
                  По выбранным условиям товаров не найдено. Проверьте
                  номенклатуру и вид поступлений.
                </p>
              )}
              {rows.length > 0 && (
                <div className="table-footer">
                  <span>
                    {(currentPage - 1) * 50 + 1}–
                    {Math.min(currentPage * 50, rows.length)} из {rows.length}
                  </span>
                  <div>
                    <Button
                      variant="default"
                      disabled={currentPage === 1}
                      onClick={() => changeFilters({ page: currentPage - 1 })}
                    >
                      Назад
                    </Button>{" "}
                    <Button
                      variant="default"
                      disabled={currentPage * 50 >= rows.length}
                      onClick={() => changeFilters({ page: currentPage + 1 })}
                    >
                      Далее
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <p className="section-note">
              Сравнений по сети: {report.stats.observations}. Без истории:{" "}
              {report.stats.no_previous}. Совпадают со средней:{" "}
              {report.stats.unchanged}. Не удалось сравнить:{" "}
              {report.stats.invalid} (нет единицы или пригодного
              количества/суммы). История короче {report.history_size}{" "}
              поступлений: {report.stats.short_history}. Счётчики относятся
              ко всему выбранному виду поступлений.
            </p>
          </>
        )}
      </Feedback>
      <details className="panel price-method">
        <summary>Как считается цена</summary>
        <p>
          Для последней закупки товара по сети берём 6 предыдущих поступлений на
          любые доступные склады: средневзвешенная цена = их общая сумма ÷ общее
          количество. Текущее поступление в эту среднюю не входит. Если истории
          меньше, используем доступные поступления и показываем их число.
          Используется вся загруженная история накладных.
        </p>
        <p>
          Цена единицы = сумма строк товара ÷ количество по накладной. Сумма
          берётся из iiko без вычитания НДС и без повторного вычитания скидки.
          Цены сравниваются с точностью до четырёх знаков после запятой.
          CSV сохраняет точность расчёта, включая изменения меньше копейки.
        </p>
        <p>
          Сравниваются один UUID товара и одна единица измерения по всей сети.
          Для графика и средней цены накладные с одинаковыми датой и временем
          считаются одним поступлением. В истории для каждой накладной видны
          поставщик, количество, сумма и цена выбранного товара.
        </p>
        <p>
          Черновики, удалённые документы и дополнительные расходы исключены.
          Связанные и несвязанные с расходной накладной поступления всегда
          сравниваются отдельно. Отсутствие связи само по себе не доказывает,
          что поставщик внешний.
        </p>
        <p>
          Это закупочная цена по загруженным документам. Она не является учётной
          себестоимостью остатков. При нулевой средней цене не рассчитываем
          процентное изменение. Если в истории есть некорректные суммы или
          количества, такое сравнение пропускаем, не подменяя поступление более
          старым.
        </p>
      </details>
      <PurchaseModal
        opened={Boolean(report && impactAllowed && impact)}
        onClose={() => setImpact(null)}
        closeButtonProps={{ "aria-label": "Закрыть влияние цены" }}
        title={
          impact
            ? "Блюда и влияние цены · " + impact.product
            : "Блюда и влияние цены"
        }
        size="70rem"
      >
        {report && impactAllowed && impact && (
          <PurchaseImpact
            key={identity(impact)}
            row={impact}
            scope={scope}
            periodVersion={[
              report?.impact_period?.end,
              report?.impact_period?.prepared_at,
              report?.impact_period?.status,
            ].join("/")}
          />
        )}
      </PurchaseModal>
      <PurchaseModal
        opened={Boolean(report && selected)}
        onClose={() => setSelected(null)}
        closeButtonProps={{ "aria-label": "Закрыть сравнение накладных" }}
        title={
          selected ? "Динамика цены · " + selected.product : "Динамика цены"
        }
        size="xl"
      >
        {report && selected && (
          <PriceDetails key={identity(selected)} row={selected} scope={scope} />
        )}
      </PurchaseModal>
    </>
  );
}
const summaryPercent = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function PriceDetailSummary({ row }: { row: PriceChange }) {
  const { current, previous, delta, percent, unit } = row;
  const unitPrice = "₽/" + unit;
  const percentText =
    percent !== null && Math.abs(Number(percent)) >= 1
      ? summaryPercent.format(Number(percent))
      : signed(percent);
  const countLabel =
    previous.count === 1
      ? "поступление"
      : previous.count < 5
        ? "поступления"
        : "поступлений";
  return (
    <section
      className="price-detail-summary"
      aria-label="Сравнение закупочной цены"
    >
      <div className="price-detail-headline">
        <strong>
          {price(current.price)} <span>{unitPrice}</span>
        </strong>
        {delta !== null && (
          <span
            className={
              Number(delta) > 0
                ? "price-rise"
                : Number(delta) < 0
                  ? "price-fall"
                  : "muted"
            }
          >
            {Number(delta) === 0
              ? "Без изменения"
              : `${signed(delta)} ${unitPrice}`}
            {Number(delta) !== 0 && percent !== null && ` (${percentText}%)`}
          </span>
        )}
      </div>
      {previous.count > 0 ? (
        <p>
          Средневзвешенная —{" "}
          <b>
            {price(previous.price)} {unitPrice}
          </b>{" "}
          · {previous.count} {countLabel}, {number(previous.amount)} {unit}
        </p>
      ) : (
        <p>Первое поступление в истории</p>
      )}
      <p className="price-detail-meta">
        Последняя закупка · {dateText(current.date)} · {number(current.amount)}{" "}
        {unit} · {row.scope_label}
      </p>
    </section>
  );
}

export function PriceDetails({
  row,
  scope,
}: {
  row: PriceChange;
  scope: string;
}) {
  const params = new URLSearchParams(scope);
  params.set("product_id", row.product_id);
  params.delete("store_id");
  params.set("unit_id", row.unit_id);
  params.set("linked", String(row.linked));
  const state = useData<PriceChange>(
    "/purchase-prices/history?" + params.toString(),
  );
  const selected = state.data;
  const previousInvoices = useMemo(
    () => (selected ? purchaseInvoiceRows(selected.previous.receipts) : []),
    [selected],
  );
  const currentInvoices = useMemo(
    () => (selected ? purchaseInvoiceRows([selected.current]) : []),
    [selected],
  );
  return (
    <Feedback state={state}>
      {selected && (
        <>
          <PriceDetailSummary row={selected} />
          <div
            className={
              selected.previous.receipts.length === 1
                ? "price-comparison"
                : "price-latest-receipt"
            }
          >
            <Sources
              title="Последнее поступление"
              invoices={currentInvoices}
              unit={selected.unit}
              showFigures={currentInvoices.length > 1}
            />
            {selected.previous.receipts.length === 1 && (
              <Sources
                title="Предыдущее поступление"
                invoices={previousInvoices}
                unit={selected.unit}
                showFigures
              />
            )}
          </div>
          <PriceChart row={selected} />
          <section className="price-history">
            <div className="panel-heading">
              <h3>Предыдущие накладные · {previousInvoices.length}</h3>
              <Button
                variant="default"
                onClick={() =>
                  exportHistory(selected, [
                    ...currentInvoices,
                    ...previousInvoices,
                  ])
                }
              >
                CSV истории
              </Button>
            </div>
            {selected.previous.count > 0 && (
              <p className="muted">
                {dateText(selected.previous.date_from)}
                {selected.previous.date_from !== selected.previous.date &&
                  ` — ${dateText(selected.previous.date)}`}
                {" · "}
                {price(selected.previous.sum)} ₽ за{" "}
                {number(selected.previous.amount)} {selected.unit}
              </p>
            )}
            <div className="table-scroll price-history-desktop">
              <table className="price-history-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th scope="col">Поставщик</th>
                    <th className="numeric">Цена, ₽/{selected.unit}</th>
                    <th className="numeric">Количество, {selected.unit}</th>
                    <th className="numeric">Сумма, ₽</th>
                    <th>Накладная</th>
                  </tr>
                </thead>
                <tbody>
                  {previousInvoices.map((invoice) => (
                    <tr key={invoice.document_id}>
                      <td className="price-receipt-date">
                        {dateText(invoice.date)}
                      </td>
                      <td className="price-history-suppliers">
                        <SupplierNames lines={invoice.lines} />
                      </td>
                      <td className="numeric">{price(invoice.price)}</td>
                      <td className="numeric">{number(invoice.amount)}</td>
                      <td className="numeric">{price(invoice.sum)}</td>
                      <td>
                        <InvoiceLink invoice={invoice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol
              className="price-receipt-list"
              aria-label="Предыдущие накладные"
            >
              {previousInvoices.map((invoice) => (
                <li className="price-receipt-card" key={invoice.document_id}>
                  <div className="price-receipt-heading">
                    <time
                      className="price-receipt-date"
                      dateTime={invoice.date}
                    >
                      {dateText(invoice.date)}
                    </time>
                    <strong>
                      {price(invoice.price)} ₽/{selected.unit}
                    </strong>
                  </div>
                  <p className="price-receipt-meta">
                    {number(invoice.amount)} {selected.unit} ·{" "}
                    {price(invoice.sum)} ₽
                  </p>
                  <SupplierNames lines={invoice.lines} labelled />
                  <InvoiceLink invoice={invoice} />
                </li>
              ))}
            </ol>
            <details className="price-method">
              <summary>Строки предыдущих накладных</summary>
              {previousInvoices.map((invoice) => (
                <InvoiceSource
                  key={invoice.document_id}
                  invoice={invoice}
                  unit={selected.unit}
                  showFigures
                />
              ))}
            </details>
          </section>
        </>
      )}
    </Feedback>
  );
}

function supplierName(line: SourceLine) {
  const name = line.supplier?.trim();
  if (!name || name === "—") return "Не указан";
  // The API returns the counteragent UUID when its directory name is missing.
  if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(name))
    return "Название не найдено";
  return name;
}

function SupplierNames({
  lines,
  labelled = false,
}: {
  lines: SourceLine[];
  labelled?: boolean;
}) {
  const names = [...new Set(lines.map(supplierName))];
  return (
    <div className="price-supplier-names">
      {labelled && (
        <span className="price-supplier-label">
          {names.length > 1 ? "Поставщики" : "Поставщик"}
        </span>
      )}
      {names.length ? (
        names.map((name) => <strong key={name}>{name}</strong>)
      ) : (
        <strong>Не указан</strong>
      )}
    </div>
  );
}

function InvoiceLink({
  invoice,
  fullLabel = false,
}: {
  invoice: InvoiceRow;
  fullLabel?: boolean;
}) {
  const label = invoice.document_number
    ? (fullLabel ? "Накладная №" : "№") + invoice.document_number
    : "Накладная без номера";
  return (
    <Link
      className={fullLabel ? "text-link" : "text-link price-history-link"}
      to={"/invoices/" + invoice.document_id}
    >
      {label} <IconArrowUpRight size={14} aria-hidden="true" />
    </Link>
  );
}

function exportHistory(row: PriceChange, invoices: InvoiceRow[]) {
  csv(
    "Динамика цены — " + row.product,
    [
      ["date", "Дата поступления"],
      ["price", "Цена за единицу"],
      ["amount", "Количество товара"],
      ["sum", "Сумма по товару"],
      ["unit", "Единица"],
      ["latest", "Последнее поступление"],
      ["documents", "Накладная и UUID"],
      ["suppliers", "Поставщик"],
      ["stores", "Склады поступления"],
      ["source_lines", "Исходные строки: номер, вхождение, количество, сумма"],
    ].map(([key, label]) => ({ key, label })),
    invoices.map((invoice) => ({
      date: invoice.date,
      price: csvPrice(invoice.price),
      amount: csvPrice(invoice.amount),
      sum: csvPrice(invoice.sum),
      unit: row.unit,
      latest: invoice.date === row.current.date ? "Да" : "Нет",
      documents: `${invoice.document_number ?? "Без номера"} [${invoice.document_id}]`,
      suppliers: [...new Set(invoice.lines.map(supplierName))].join("; "),
      stores: [...new Set(invoice.lines.map((line) => line.store))].join("; "),
      source_lines: invoice.lines
        .map(
          (line) =>
            `${line.document_id}, ${line.num}.${line.num_occurrence}, ${line.store}: ${line.amount} ${row.unit}, ${csvPrice(line.sum)} ₽`,
        )
        .join("; "),
    })),
    ["price", "amount", "sum"],
  );
}

function PriceChart({ row }: { row: PriceChange }) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const chartWidth = Math.max(280, Math.round(width || 740));
  const observations = [...row.previous.receipts, row.current];
  const values = observations.map((o) => Number(o.price));
  const min = Math.min(...values),
    max = Math.max(...values);
  const padding = Math.max((max - min) * 0.15, max * 0.03, 1);
  const low = Math.max(0, min - padding),
    high = max + padding;
  const valueLabelWidth =
    Math.max(...observations.map((o) => price(o.price).length)) * 8;
  const axisLabelWidth = Math.max(price(low).length, price(high).length) * 8;
  const left = Math.max(52, axisLabelWidth + 12, valueLabelWidth / 2 + 8);
  const right = chartWidth - Math.max(26, valueLabelWidth / 2 + 8);
  const positions = priceTimeline(
    observations.map((o) => o.date),
    left,
    right,
  );
  const points = observations.flatMap((receipt, i) => {
    const x = positions[i];
    if (x === null) return [];
    const [day, time] = dateText(receipt.date).split(", ");
    return [{ receipt, x, day, time }];
  });
  if (!points.length) return null;
  const firstYear = points[0].day.slice(6);
  const singleYear = points.every((point) => point.day.slice(6) === firstYear);
  const xs = points.map((p) => p.x);
  const dateLabels = visibleChartLabels(xs, 50);
  const valueLabels = visibleChartLabels(xs, valueLabelWidth + 12);
  const y = (v: number) => 200 - ((v - low) / (high - low)) * 150;
  return (
    <section className="price-chart">
      <h3>Динамика закупочной цены</h3>
      <p className="muted">
        ₽/{row.unit}
        {singleYear && ` · ${firstYear}`}
      </p>
      <div className="price-chart-canvas" ref={ref}>
        <svg
          viewBox={`0 0 ${chartWidth} 260`}
          role="img"
          aria-label={"Динамика закупочной цены: " + row.product}
        >
          <title>
            {observations
              .map(
                (o) => `${dateText(o.date)}: ${price(o.price)} ₽/${row.unit}`,
              )
              .join("; ")}
          </title>
          {[low, (low + high) / 2, high].map((v) => (
            <g key={v}>
              <line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#2d3c50" />
              <text x={left - 10} y={y(v) + 4} textAnchor="end">
                {price(v)}
              </text>
            </g>
          ))}
          <polyline
            points={points
              .map((p) => `${p.x},${y(Number(p.receipt.price))}`)
              .join(" ")}
            fill="none"
            stroke="#65d7e5"
            strokeWidth="3"
          />
          {points.map(({ receipt, x, day, time }, i) => {
            const cy = y(Number(receipt.price));
            const current = receipt === row.current;
            const sameDay = points.some((p, j) => i !== j && p.day === day);
            const dateDetail =
              sameDay && time ? time : singleYear ? null : day.slice(6);
            return (
              <g key={receipt.date}>
                <circle
                  cx={x}
                  cy={cy}
                  r={current ? 6 : 4}
                  fill={current ? "#65d7b6" : "#65d7e5"}
                >
                  <title>
                    {dateText(receipt.date)} · {price(receipt.price)} ₽/
                    {row.unit}
                  </title>
                </circle>
                {valueLabels.has(i) && (
                  <text x={x} y={cy - 13} textAnchor="middle">
                    {price(receipt.price)}
                  </text>
                )}
                {dateLabels.has(i) && (
                  <text x={x} y="231" textAnchor="middle">
                    {day.slice(0, 5)}
                    {dateDetail && (
                      <tspan x={x} dy="17">
                        {dateDetail}
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function sourceWarehouse(line: SourceLine) {
  return [line.department, line.store].filter(Boolean).join(" · ");
}

function Sources({
  title,
  invoices,
  unit,
  showFigures,
}: {
  title: string;
  invoices: InvoiceRow[];
  unit: string;
  showFigures: boolean;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {invoices.length === 0 && <SupplierNames lines={[]} labelled />}
      {invoices.map((invoice) => (
        <InvoiceSource
          key={invoice.document_id}
          invoice={invoice}
          unit={unit}
          showFigures={showFigures}
        />
      ))}
    </section>
  );
}

function InvoiceSource({
  invoice,
  unit,
  showFigures,
}: {
  invoice: InvoiceRow;
  unit: string;
  showFigures: boolean;
}) {
  const stores = [
    ...new Set(invoice.lines.map(sourceWarehouse).filter(Boolean)),
  ];
  return (
    <div className="price-source">
      {showFigures && (
        <p>
          {dateText(invoice.date)} ·{" "}
          <strong>
            {price(invoice.price)} ₽/{unit}
          </strong>
          <small className="price-subtext">
            {price(invoice.sum)} ₽ за {number(invoice.amount)} {unit}
          </small>
        </p>
      )}
      <div className="price-document-heading">
        <div>
          <SupplierNames lines={invoice.lines} labelled />
          {stores.map((store) => (
            <small className="price-subtext" key={store}>
              {store}
            </small>
          ))}
        </div>
        <InvoiceLink invoice={invoice} fullLabel />
      </div>
      <details className="price-source-details">
        <summary>Подробности</summary>
        {invoice.lines.map((line) => (
          <div
            className="price-source-line"
            key={line.num + "/" + line.num_occurrence}
          >
            <strong>
              Строка {line.num}
              {line.num_occurrence > 1 && " · вхождение " + line.num_occurrence}
            </strong>
            {stores.length > 1 && <span>{sourceWarehouse(line)}</span>}
            <span>
              {number(line.amount)} {unit} · {price(line.sum)} ₽
            </span>
            <span>
              Исходная цена iiko:{" "}
              {line.price === null ? "—" : price(line.price) + " ₽"}
            </span>
            <span>Загружено: {dateText(line.last_seen_at)}</span>
          </div>
        ))}
      </details>
    </div>
  );
}

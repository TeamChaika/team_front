import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, Select } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconArrowUpRight, IconDownload } from "@tabler/icons-react";
import { useWorkspace } from "./App";
import { useData } from "./useData";
import { csv, dateText, number } from "./api";
import { Feedback, PageTitle } from "./pages";
import { PurchaseImpact } from "./PurchaseImpact";
import { PurchaseModal } from "./PurchaseModal";
import { useAssistant } from "./AssistantContext";
import "./purchase-prices.css";

type SourceLine = {
  document_id: string;
  document_number: string | null;
  num: number;
  num_occurrence: number;
  supplier: string;
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
  impact_period?: {
    start: string;
    end: string;
    recipe_day: string | null;
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
const priceFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});
const signedFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const price = (v: string | number | null) =>
  v === null ? "—" : priceFormat.format(Number(v)).replace(/^-0$/, "0");
const signed = (v: string | null) =>
  v === null ? "—" : signedFormat.format(Number(v));
const csvPrice = (v: string | null) =>
  v === null ? null : price(v).replace(/\s/g, "");
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

export function PurchasePrices() {
  const w = useWorkspace();
  const params = new URLSearchParams(w.query());
  params.delete("department_id");
  params.delete("start");
  params.delete("end");
  return <PriceWorkspace key={params.toString()} scope={params.toString()} />;
}
function PriceWorkspace({ scope }: { scope: string }) {
  const assistant = useAssistant();
  const [kind, setKind] = useState("unlinked");
  const [excludeHousehold, setExcludeHousehold] = useState(true);
  const [recentOnly, setRecentOnly] = useState(true);
  const reportPath =
    "/purchase-prices?" +
    scope +
    "&kind=" +
    kind +
    "&exclude_household=" +
    excludeHousehold +
    "&recent_only=" +
    recentOnly;
  const state = useData<Report>(reportPath);
  const matchesFilters = (value: Report | null) =>
    value?.kind === kind &&
    value.exclude_household === excludeHousehold &&
    value.recent_only === recentOnly;
  const prices = matchesFilters(state.data) ? state.data : null;
  // Prices remain usable while one batch calculates all weekly scenarios.
  const weekly = useData<Report>(
    prices ? reportPath + "&include_impact=true" : null,
  );
  const detailed = matchesFilters(weekly.data) ? weekly.data : null;
  const report = detailed ?? prices;
  const calculating = !!prices && !detailed && !weekly.error;
  const [product, setProduct] = useState<string | null>(null);
  const [direction, setDirection] = useState("all");
  const [threshold, setThreshold] = useState("0");
  const [sort, setSort] = useState("percent_desc");
  const [page, setPage] = useState(0);
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
      },
      row?.product ?? null,
    );
  }
  const all = report?.rows ?? [];
  const historySize = report?.history_size ?? 6;
  const rows = all
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
      const byDate = b.current.date.localeCompare(a.current.date);
      if (sort === "date") return byDate;
      if (sort === "weekly_desc" || sort === "weekly_asc") {
        const left = a.impact?.weekly_delta ?? null;
        const right = b.impact?.weekly_delta ?? null;
        if (left === null || right === null)
          return left === right ? byDate : left === null ? 1 : -1;
        return (
          (sort === "weekly_asc"
            ? Number(left) - Number(right)
            : Number(right) - Number(left)) || byDate
        );
      }
      // A zero baseline has no percentage; keep those rows last in either direction.
      if (a.percent === null || b.percent === null) {
        return a.percent === b.percent ? byDate : a.percent === null ? 1 : -1;
      }
      const left = Number(a.percent);
      const right = Number(b.percent);
      const difference =
        sort === "percent"
          ? Math.abs(right) - Math.abs(left)
          : sort === "percent_asc"
            ? left - right
            : right - left;
      return difference || byDate;
    });
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 50) - 1),
  );
  const visible = rows.slice(currentPage * 50, currentPage * 50 + 50);
  const choices = () =>
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
    ].sort((a, b) => a.label.localeCompare(b.label, "ru"));
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
        old_amount: r.previous.amount,
        old_sum: csvPrice(r.previous.sum),
        new_amount: r.current.amount,
        new_sum: csvPrice(r.current.sum),
        linked: r.linked ? "Да" : "Нет",
      })),
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
        {state.data?.recent_only &&
          ` В списке товары с последним поступлением с ${dateText(state.data.recent_since)}.`}
      </div>
      <section className="panel">
        <div className="price-household-filter">
          <Checkbox
            label="Были поступления за последние 60 дней"
            description="На любой склад сети. История предыдущих поступлений сохраняется целиком."
            checked={recentOnly}
            onChange={(event) => {
              setRecentOnly(event.currentTarget.checked);
              setProduct(null);
              setSelected(null);
              setPage(0);
            }}
          />
          <Checkbox
            label="Скрыть хозтовары"
            description="Группа «ХОЗНУЖДЫ» и её подгруппы: хозтовары, хозрасходы, посуда и одноразовая посуда."
            checked={excludeHousehold}
            onChange={(event) => {
              setExcludeHousehold(event.currentTarget.checked);
              setProduct(null);
              setSelected(null);
              setPage(0);
            }}
          />
        </div>
        <div className="price-filters">
          <Select
            label="Поступления"
            value={kind}
            onChange={(v) => {
              setKind(v ?? "unlinked");
              setProduct(null);
              setSelected(null);
              setPage(0);
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
            onChange={(v) => {
              setProduct(v);
              setPage(0);
            }}
            data={choices()}
            nothingFoundMessage="Товар не найден в поступлениях"
          />
          <Select
            label="Направление"
            value={direction}
            onChange={(v) => {
              setDirection(v ?? "all");
              setPage(0);
            }}
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
            onChange={(v) => {
              setThreshold(v ?? "0");
              setPage(0);
            }}
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
            onChange={(v) => {
              setSort(v ?? "percent_desc");
              setPage(0);
            }}
            data={[
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
              { value: "date", label: "Сначала последние" },
              {
                value: "percent",
                label: "По величине изменения: рост и снижение",
              },
            ]}
          />
        </div>
      </section>
      <Feedback state={state}>
        {state.data && (
          <>
            <div className="price-summary" aria-label="Итоги изменений">
              <div>
                <span>Товаров в выборке</span>
                <strong>{new Set(rows.map((r) => r.product_id)).size}</strong>
              </div>
              <div>
                <span>Повышений цены</span>
                <strong className="price-rise">
                  {rows.filter((r) => Number(r.delta) > 0).length}
                </strong>
              </div>
              <div>
                <span>Снижений цены</span>
                <strong className="price-fall">
                  {rows.filter((r) => Number(r.delta) < 0).length}
                </strong>
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
                  {report?.impact_period && (
                    <p>
                      Влияние за неделю — оценка по техкартам и продажам за{" "}
                      {dateText(report.impact_period.start)}–
                      {dateText(report.impact_period.end)}. «+» — рост затрат,
                      «−» — экономия при прежнем темпе продаж. Нажмите сумму,
                      чтобы увидеть расчёт по блюдам.
                    </p>
                  )}
                  {calculating && (
                    <p role="status">
                      Рассчитываем влияние на неделю… Цены уже доступны.
                    </p>
                  )}
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
                  {weekly.error && (
                    <p role="alert">
                      Не удалось рассчитать влияние на неделю. {weekly.error}{" "}
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={weekly.reload}
                      >
                        Повторить расчёт
                      </Button>
                    </p>
                  )}
                </div>
                <Button
                  variant="default"
                  leftSection={<IconDownload size={16} />}
                  disabled={!rows.length || !detailed}
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
                      <th>Последнее поступление</th>
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
                          onClick={() => {
                            setSort(
                              sort === "percent_desc"
                                ? "percent_asc"
                                : "percent_desc",
                            );
                            setPage(0);
                          }}
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
                          onClick={() => {
                            setSort(
                              sort === "weekly_desc"
                                ? "weekly_asc"
                                : "weekly_desc",
                            );
                            setPage(0);
                          }}
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
                        </td>
                        <td className="numeric price-weekly">
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
                                ? calculating
                                  ? "Расчёт…"
                                  : "Ошибка расчёта"
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
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => setImpact(r)}
                              aria-label={"Блюда и влияние цены: " + r.product}
                            >
                              Блюда и влияние
                            </Button>
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
                    {currentPage * 50 + 1}–
                    {Math.min((currentPage + 1) * 50, rows.length)} из{" "}
                    {rows.length}
                  </span>
                  <div>
                    <Button
                      variant="default"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Назад
                    </Button>{" "}
                    <Button
                      variant="default"
                      disabled={(currentPage + 1) * 50 >= rows.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Далее
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <p className="section-note">
              Сравнений по сети: {state.data.stats.observations}. Без истории:{" "}
              {state.data.stats.no_previous}. Совпадают со средней:{" "}
              {state.data.stats.unchanged}. Не удалось сравнить:{" "}
              {state.data.stats.invalid} (нет единицы или пригодного
              количества/суммы). История короче {state.data.history_size}{" "}
              поступлений: {state.data.stats.short_history}. Счётчики относятся
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
          Цены сравниваются с точностью до 4 знаков. В таблицах, графике и CSV
          цены, суммы и проценты округлены до одного знака после запятой.
        </p>
        <p>
          Сравниваются один UUID товара и одна единица измерения по всей сети.
          Накладные с одинаковыми датой и временем считаются одним поступлением
          с общей суммой и количеством. Смена поставщика допустима; поставщики
          видны в сравнении.
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
        opened={Boolean(impact)}
        onClose={() => setImpact(null)}
        closeButtonProps={{ "aria-label": "Закрыть влияние цены" }}
        title={
          impact
            ? "Блюда и влияние цены · " + impact.product
            : "Блюда и влияние цены"
        }
        size="70rem"
      >
        {impact && (
          <PurchaseImpact key={identity(impact)} row={impact} scope={scope} />
        )}
      </PurchaseModal>
      <PurchaseModal
        opened={Boolean(selected)}
        onClose={() => setSelected(null)}
        closeButtonProps={{ "aria-label": "Закрыть сравнение накладных" }}
        title={
          selected ? "Динамика цены · " + selected.product : "Динамика цены"
        }
        size="xl"
      >
        {selected && (
          <PriceDetails key={identity(selected)} row={selected} scope={scope} />
        )}
      </PurchaseModal>
    </>
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
  const historySize = 6;
  return (
    <Feedback state={state}>
      {selected && (
        <>
          <p>
            {selected.scope_label} · {selected.unit}
          </p>
          <p className="price-comparison-total">
            {selected.previous.count > 0 && (
              <>{price(selected.previous.price)} → </>
            )}
            {price(selected.current.price)} ₽/{selected.unit}{" "}
            <Percent row={selected} />
          </p>
          <PriceChart row={selected} />
          <div className="price-comparison">
            <section>
              <h3>Средняя предыдущих поступлений</h3>
              <p>
                Поступлений: {selected.previous.count} из {historySize}
              </p>
              {selected.previous.count === 0 && (
                <p className="muted">
                  Это первое загруженное поступление. Сравнивать пока не с чем.
                </p>
              )}
              <strong>
                {price(selected.previous.price)} ₽/{selected.unit}
              </strong>
              {selected.previous.count > 0 && (
                <>
                  <p>
                    {price(selected.previous.sum)} ₽ ÷{" "}
                    {number(selected.previous.amount)} {selected.unit}
                  </p>
                </>
              )}
              <p className="muted">
                {dateText(selected.previous.date_from)} —{" "}
                {dateText(selected.previous.date)}
              </p>
              {selected.previous.count > 0 &&
                selected.previous.count < historySize && (
                  <p className="muted">
                    В истории доступно меньше 6 поступлений. Средняя рассчитана
                    по указанным ниже документам.
                  </p>
                )}
            </section>
            <Sources
              title="Последнее поступление"
              value={selected.current}
              unit={selected.unit}
            />
          </div>
          <section className="price-history">
            <div className="panel-heading">
              <h3>Предыдущие поступления · {selected.previous.count}</h3>
              <Button variant="default" onClick={() => exportHistory(selected)}>
                CSV истории
              </Button>
            </div>
            <p className="muted">
              От раннего к последнему. Текущее поступление в расчёт средней не
              включено.
            </p>
            <div className="table-scroll price-history-desktop">
              <table className="price-history-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th className="numeric">Цена, ₽/{selected.unit}</th>
                    <th className="numeric">Количество, {selected.unit}</th>
                    <th className="numeric">Сумма, ₽</th>
                    <th>Накладные</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.previous.receipts.map((receipt) => (
                    <tr key={receipt.date}>
                      <td className="price-receipt-date">
                        {dateText(receipt.date)}
                      </td>
                      <td className="numeric">{price(receipt.price)}</td>
                      <td className="numeric">{number(receipt.amount)}</td>
                      <td className="numeric">{price(receipt.sum)}</td>
                      <td>
                        <ReceiptLinks receipt={receipt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol
              className="price-receipt-list"
              aria-label="Предыдущие поступления"
            >
              {selected.previous.receipts.map((receipt) => (
                <li className="price-receipt-card" key={receipt.date}>
                  <div className="price-receipt-heading">
                    <time
                      className="price-receipt-date"
                      dateTime={receipt.date}
                    >
                      {dateText(receipt.date)}
                    </time>
                    <strong>
                      {price(receipt.price)} ₽/{selected.unit}
                    </strong>
                  </div>
                  <p className="price-receipt-meta">
                    {number(receipt.amount)} {selected.unit} ·{" "}
                    {price(receipt.sum)} ₽
                  </p>
                  <ReceiptLinks receipt={receipt} />
                </li>
              ))}
            </ol>
            <details className="price-method">
              <summary>Строки предыдущих накладных и поставщики</summary>
              {selected.previous.receipts.map((receipt, index) => (
                <Sources
                  key={receipt.date}
                  title={"Поступление " + (index + 1)}
                  value={receipt}
                  unit={selected.unit}
                />
              ))}
            </details>
          </section>
        </>
      )}
    </Feedback>
  );
}

function ReceiptLinks({ receipt }: { receipt: Observation }) {
  const documents = [
    ...new Map(receipt.lines.map((line) => [line.document_id, line])).values(),
  ];
  return (
    <div className="price-receipt-links">
      {documents.map((line) => (
        <Link
          key={line.document_id}
          className="text-link price-history-link"
          to={"/invoices/" + line.document_id}
        >
          <span>
            {line.document_number
              ? "№" + line.document_number
              : "Накладная без номера"}
          </span>
          <IconArrowUpRight size={14} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

function exportHistory(row: PriceChange) {
  csv(
    "Динамика цены — " + row.product,
    [
      ["date", "Дата поступления"],
      ["price", "Цена поступления"],
      ["amount", "Количество поступления"],
      ["sum", "Сумма поступления"],
      ["unit", "Единица"],
      ["latest", "Последнее поступление"],
      ["documents", "Накладные и UUID"],
      ["suppliers", "Поставщики"],
      ["stores", "Склады поступления"],
      ["source_lines", "Исходные строки: номер, вхождение, количество, сумма"],
    ].map(([key, label]) => ({ key, label })),
    [...row.previous.receipts, row.current].map((o) => ({
      date: o.date,
      price: csvPrice(o.price),
      amount: o.amount,
      sum: csvPrice(o.sum),
      unit: row.unit,
      latest: o.date === row.current.date ? "Да" : "Нет",
      documents: [
        ...new Set(
          o.lines.map(
            (l) => `${l.document_number ?? l.document_id} [${l.document_id}]`,
          ),
        ),
      ].join("; "),
      suppliers: [...new Set(o.lines.map((l) => l.supplier))].join("; "),
      stores: [...new Set(o.lines.map((l) => l.store))].join("; "),
      source_lines: o.lines
        .map(
          (l) =>
            `${l.document_id}, ${l.num}.${l.num_occurrence}, ${l.store}: ${l.amount} ${row.unit}, ${csvPrice(l.sum)} ₽`,
        )
        .join("; "),
    })),
  );
}

function PriceChart({ row }: { row: PriceChange }) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const chartWidth = Math.max(280, Math.round(width || 740));
  const compact = chartWidth < 520;
  const left = compact ? 70 : 85;
  const right = chartWidth - (compact ? 18 : 85);
  const observations = [...row.previous.receipts, row.current];
  const values = observations.map((o) => Number(o.price));
  const min = Math.min(...values),
    max = Math.max(...values);
  const padding = Math.max((max - min) * 0.15, max * 0.03, 1);
  const low = Math.max(0, min - padding),
    high = max + padding;
  const x = (i: number) =>
    observations.length === 1
      ? (left + right) / 2
      : left + (i * (right - left)) / (observations.length - 1);
  const y = (v: number) => 200 - ((v - low) / (high - low)) * 150;
  return (
    <section className="price-chart">
      <h3>Динамика закупочной цены</h3>
      <p className="muted">
        До 6 предыдущих поступлений и последнее · ₽/{row.unit}
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
            points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke="#65d7e5"
            strokeWidth="3"
          />
          {observations.map((o, i) => (
            <g key={o.date}>
              <circle
                cx={x(i)}
                cy={y(Number(o.price))}
                r={i === observations.length - 1 ? 6 : 4}
                fill={i === observations.length - 1 ? "#65d7b6" : "#65d7e5"}
              />
              {(!compact || i === 0 || i === observations.length - 1) && (
                <text
                  x={x(i)}
                  y={y(Number(o.price)) - 13}
                  textAnchor={compact ? (i === 0 ? "start" : "end") : "middle"}
                >
                  {price(o.price)}
                </text>
              )}
              {(!compact ||
                i === 0 ||
                i === observations.length - 1 ||
                i === Math.floor(observations.length / 2)) && (
                <g>
                  <text
                    x={x(i)}
                    y="231"
                    textAnchor={
                      compact && i === 0
                        ? "start"
                        : compact && i === observations.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {o.date.slice(8, 10)}.{o.date.slice(5, 7)}
                  </text>
                  <text
                    x={x(i)}
                    y="248"
                    textAnchor={
                      compact && i === 0
                        ? "start"
                        : compact && i === observations.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {o.date.slice(0, 4)}
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

function Sources({
  title,
  value,
  unit,
}: {
  title: string;
  value: Observation;
  unit: string;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <p>{dateText(value.date)}</p>
      <strong>
        {price(value.price)} ₽/{unit}
      </strong>
      <p>
        {price(value.sum)} ₽ ÷ {number(value.amount)} {unit}
      </p>
      {value.lines.map((l) => (
        <div
          className="price-source"
          key={[l.document_id, l.num, l.num_occurrence].join("/")}
        >
          <Link className="text-link" to={"/invoices/" + l.document_id}>
            Накладная №{l.document_number ?? l.document_id}{" "}
            <IconArrowUpRight size={14} />
          </Link>
          <small className="price-subtext">
            Строка {l.num}
            {l.num_occurrence > 1 ? " · вхождение " + l.num_occurrence : ""}
          </small>
          <p>{l.supplier}</p>
          <small className="price-subtext">
            {l.department ? l.department + " · " : ""}
            {l.store}
          </small>
          <p>
            {number(l.amount)} {unit} · {price(l.sum)} ₽
          </p>
          <small className="muted">
            Исходная цена iiko: {l.price === null ? "—" : price(l.price)} ₽
            <br />
            Загружено: {dateText(l.last_seen_at)}
          </small>
        </div>
      ))}
    </section>
  );
}

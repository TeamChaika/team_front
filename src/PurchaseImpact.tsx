import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Select } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { csv, dateText } from "./api";
import { Feedback } from "./pages";
import { useData } from "./useData";
import type { PriceChange } from "./PurchasePrices";

type Edge = {
  chart_id: string;
  product_id: string;
  product: string;
  unit: string;
  output: string;
  ingredient_id: string;
  ingredient: string;
  ingredient_unit: string | null;
  amount: string;
};
type SaleSource = {
  date: string;
  report_id: string;
  ordinal: number;
  quantity: string | null;
};
type Dish = {
  department_id: string;
  department: string;
  dish_id: string;
  dish: string;
  quantity: string | null;
  chart_ids: string[];
  sales_sources: SaleSource[];
};
type Included = Dish & {
  amount_per_portion: string;
  monthly_amount: string;
  weekly_amount: string | null;
  portion_delta: string | null;
  weekly_delta: string | null;
  paths: Edge[][];
};
type Report = {
  available_departments: { id: string; name: string }[];
  analysis_departments: { id: string; name: string }[];
  analysis_selection: string;
  price_department_has_sales: boolean;
  sold_dishes: number;
  empty_reason: string | null;
  price: PriceChange;
  start: string;
  end: string;
  recipe_day: string | null;
  norm_unit: string | null;
  blockers: string[];
  rows: Included[];
  excluded: (Dish & { reasons: string[] })[];
  coverage: {
    loaded_days: number;
    days: number;
    complete: boolean;
    missing_dates: string[];
    partial_dates: string[];
    mismatch_dates: string[];
  };
  totals: {
    quantity: string;
    average_portion_delta: string | null;
    monthly_amount: string;
    weekly_amount: string | null;
    weekly_delta: string | null;
  };
};
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const qty = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const signed = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const money = (value: string | null) =>
  value === null ? "—" : fmt.format(Number(value));
const delta = (value: string | null) =>
  value === null ? "—" : signed.format(Number(value));
const tone = (value: string | null) =>
  Number(value) > 0 ? "price-rise" : Number(value) < 0 ? "price-fall" : "muted";
function norm(value: string, unit: string | null) {
  const scaled = unit === "кг" || unit === "л";
  return {
    value: Number(value) * (scaled ? 1000 : 1),
    unit: unit === "кг" ? "г" : unit === "л" ? "мл" : (unit ?? "ед."),
  };
}

export function PurchaseImpact({
  row,
  scope,
}: {
  row: PriceChange;
  scope: string;
}) {
  const [salesVenue, setSalesVenue] = useState<string | null>(null);
  const params = new URLSearchParams(scope);
  // The server chooses thirty completed days; page filters cannot override this window.
  params.delete("start");
  params.delete("end");
  params.delete("month");
  params.delete("analysis_department_id");
  params.delete("all_departments");
  if (salesVenue === "all") params.set("all_departments", "true");
  else if (salesVenue) params.set("analysis_department_id", salesVenue);
  params.set("product_id", row.product_id);
  params.delete("store_id");
  params.set("unit_id", row.unit_id);
  params.set("linked", String(row.linked));
  const state = useData<Report>("/purchase-prices/impact?" + params);
  const report = state.data;
  return (
    <>
      <div className="impact-toolbar">
        <p>
          {row.scope_label}
          <small className="price-subtext">
            {row.linked
              ? "Поступления, связанные с расходными накладными"
              : "Поступления без связи с расходной накладной"}
          </small>
        </p>
        <p>
          Последние 30 завершённых дней
          {report && (
            <small className="price-subtext">
              {dateText(report.start)} — {dateText(report.end)}
            </small>
          )}
        </p>
      </div>
      <Feedback state={state}>
        {report && (
          <>
            <Select
              label="Продажи"
              description="По умолчанию — вся сеть. Можно посмотреть вклад отдельного заведения."
              value={salesVenue ?? report.analysis_selection}
              onChange={setSalesVenue}
              allowDeselect={false}
              searchable
              data={[
                { value: "all", label: "Все доступные заведения с продажами" },
                ...report.available_departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                })),
              ]}
            />
            <p className="data-notice">
              Оценка по техкартам на {dateText(report.recipe_day)} и стандартным
              порциям. Сценарий показывает изменение затрат выбранных заведений,
              если закупать этот товар по последней цене сети.
            </p>
            <div className="price-summary" aria-live="polite">
              <div>
                <span>Цена последнего поступления</span>
                <strong>
                  {money(report.price.current.price)} ₽/{report.price.unit}
                </strong>
                <small className="price-subtext">
                  {dateText(report.price.current.date)} · предыдущая средняя{" "}
                  {money(report.price.previous.price)} ₽ · поступлений{" "}
                  {report.price.previous.count} из 6
                </small>
              </div>
              <div>
                <span>Потребность в неделю по норме</span>
                <strong>
                  {money(report.totals.weekly_amount)} {report.norm_unit}
                </strong>
                <small className="price-subtext">
                  По {report.rows.length} позициям · продано{" "}
                  {qty.format(Number(report.totals.quantity))} за 30 дней
                </small>
              </div>
              <div>
                <span>Изменение затрат в неделю</span>
                <strong className={tone(report.totals.weekly_delta)}>
                  {delta(report.totals.weekly_delta)} ₽
                </strong>
                <small className="price-subtext">
                  При сохранении темпа продаж и закупках по этой цене
                </small>
              </div>
            </div>
            <p className="section-note">
              Продажи: {dateText(report.start)} — {dateText(report.end)}.
              Загружено дней: {report.coverage.loaded_days} из{" "}
              {report.coverage.days}.
              {report.coverage.complete &&
                " Автоматическая сверка продаж сошлась."}
            </p>
            {report.blockers.length > 0 && (
              <div className="data-notice" role="status">
                {report.blockers.map((b) => (
                  <p key={b}>{b}.</p>
                ))}
                {report.coverage.missing_dates.length > 0 && (
                  <p>
                    Нет дней:{" "}
                    {report.coverage.missing_dates
                      .map((d) => dateText(d))
                      .join(", ")}
                    .
                  </p>
                )}
                {report.coverage.partial_dates.length > 0 && (
                  <p>
                    Незавершённые снимки:{" "}
                    {report.coverage.partial_dates
                      .map((d) => dateText(d))
                      .join(", ")}
                    .
                  </p>
                )}
                {report.coverage.mismatch_dates.length > 0 && (
                  <p>
                    Расхождения сверки:{" "}
                    {report.coverage.mismatch_dates
                      .map((d) => dateText(d))
                      .join(", ")}
                    .
                  </p>
                )}
              </div>
            )}
            <div className="panel-heading">
              <h3>Блюда по заведениям · {report.rows.length}</h3>
              <Button
                variant="default"
                leftSection={<IconDownload size={16} />}
                onClick={() => exportImpact(report)}
              >
                CSV расчёта
              </Button>
            </div>
            <p className="section-note">
              В продажах найдено {report.sold_dishes} позиций по заведениям;
              рассчитано {report.rows.length}, исключено{" "}
              {report.excluded.length}.
            </p>
            {!report.rows.length && (
              <p className="section-note">{report.empty_reason}</p>
            )}
            {report.rows.length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Заведение</th>
                      <th>Блюдо и вхождения</th>
                      <th className="numeric">Продано за 30 дней</th>
                      <th className="numeric">Товара на порцию</th>
                      <th className="numeric">Изменение на порцию, ₽</th>
                      <th className="numeric">За неделю, ₽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((d) => {
                      const n = norm(d.amount_per_portion, report.norm_unit);
                      return (
                        <tr key={d.department_id + "/" + d.dish_id}>
                          <td>{d.department}</td>
                          <td>
                            <details className="impact-dish">
                              <summary>{d.dish}</summary>
                              {d.paths.map((path, i) => (
                                <div className="impact-path" key={i}>
                                  <strong>Вхождение {i + 1}</strong>
                                  <ol>
                                    {path.map((e) => {
                                      const a = norm(
                                        e.amount,
                                        e.ingredient_unit,
                                      );
                                      return (
                                        <li
                                          key={
                                            e.chart_id + "/" + e.ingredient_id
                                          }
                                        >
                                          <Link
                                            className="text-link"
                                            to={"/charts/" + e.chart_id}
                                          >
                                            {e.product}
                                          </Link>
                                          <span className="price-subtext">
                                            На выход{" "}
                                            {qty.format(Number(e.output))}{" "}
                                            {e.unit}: {fmt.format(a.value)}{" "}
                                            {a.unit}{" "}
                                            <Link
                                              className="text-link"
                                              to={
                                                "/products/" + e.ingredient_id
                                              }
                                            >
                                              {e.ingredient}
                                            </Link>
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ol>
                                </div>
                              ))}
                              <SalesSources dish={d} />
                            </details>
                          </td>
                          <td className="numeric">
                            {qty.format(Number(d.quantity))}
                          </td>
                          <td className="numeric">
                            {fmt.format(n.value)} {n.unit}
                          </td>
                          <td className={"numeric " + tone(d.portion_delta)}>
                            {delta(d.portion_delta)}
                          </td>
                          <td className={"numeric " + tone(d.weekly_delta)}>
                            {delta(d.weekly_delta)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="impact-totals">
                    <tr>
                      <th scope="row" colSpan={2}>
                        Итого
                        <small className="price-subtext">
                          По рассчитанным позициям
                        </small>
                      </th>
                      <td className="numeric">
                        {qty.format(Number(report.totals.quantity))}
                      </td>
                      <td className="numeric">—</td>
                      <td
                        className={
                          "numeric " + tone(report.totals.average_portion_delta)
                        }
                      >
                        {delta(report.totals.average_portion_delta)}
                        <small className="price-subtext">
                          В среднем на порцию
                        </small>
                      </td>
                      <td
                        className={
                          "numeric " + tone(report.totals.weekly_delta)
                        }
                      >
                        {delta(report.totals.weekly_delta)} ₽
                        <small className="price-subtext">За неделю</small>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {report.excluded.length > 0 && (
              <details className="price-method impact-exclusions">
                <summary>
                  Не включены в оценку · {report.excluded.length}
                </summary>
                <p>
                  Эти позиции встречаются в цепочках техкарт. Их влияние нельзя
                  достоверно посчитать по выбранным данным.
                </p>
                {report.excluded.map((d) => (
                  <div
                    className="price-source"
                    key={d.department_id + "/" + d.dish_id}
                  >
                    <small className="price-subtext">{d.department}</small>
                    <strong>{d.dish}</strong> · продано{" "}
                    {d.quantity === null ? "—" : qty.format(Number(d.quantity))}
                    <p>{d.reasons.join(". ")}.</p>
                    {d.chart_ids.map((id, i) => (
                      <Link
                        key={id}
                        className="text-link price-history-link"
                        to={"/charts/" + id}
                      >
                        Техкарта {i + 1}
                      </Link>
                    ))}
                    <SalesSources dish={d} />
                  </div>
                ))}
              </details>
            )}
            <details className="price-method">
              <summary>Накладные и метод расчёта</summary>
              <p>
                Норма учитывает выход полуфабрикатов. Изменение на порцию =
                норма × (последняя цена − средневзвешенная предыдущих 6
                поступлений). Недельное изменение = изменение на порцию ×
                продажи за 30 дней × 7 ÷ {report.coverage.days}. В строке «Итого»
                изменение на порцию усредняется с учётом количества проданных
                порций каждого блюда.
              </p>
              <p>
                Используются доступные техкарты на указанную дату, а не
                восстановленный фактический расход за период. Размер стандартной
                порции принят равным 1. Остатки по старой цене, модификаторы и
                изменение спроса в прогноз не включены. Закупки с привязкой к
                расходной накладной и без неё сравниваются отдельно. Отсутствие
                привязки не доказывает внешнюю закупку.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Поступление</th>
                      <th>Накладные</th>
                      <th className="numeric">
                        Количество, {report.price.unit}
                      </th>
                      <th className="numeric">Цена, ₽/{report.price.unit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...report.price.previous.receipts,
                      report.price.current,
                    ].map((o) => (
                      <tr key={o.date}>
                        <td>
                          {dateText(o.date)}
                          {o.date === report.price.current.date && (
                            <small className="price-subtext">Последнее</small>
                          )}
                        </td>
                        <td>
                          {[
                            ...new Map(
                              o.lines.map((l) => [l.document_id, l]),
                            ).values(),
                          ].map((l) => (
                            <Link
                              key={l.document_id}
                              className="text-link price-history-link"
                              to={"/invoices/" + l.document_id}
                            >
                              №{l.document_number ?? l.document_id} ·{" "}
                              {l.supplier} · {l.store}
                            </Link>
                          ))}
                        </td>
                        <td className="numeric">
                          {qty.format(Number(o.amount))}
                        </td>
                        <td className="numeric">{money(o.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Feedback>
    </>
  );
}

function SalesSources({ dish }: { dish: Dish }) {
  return (
    <details className="impact-sources">
      <summary>
        Продажи по дням · {dish.sales_sources.length} строк OLAP
      </summary>
      {dish.sales_sources.map((s) => (
        <p key={s.report_id + "/" + s.ordinal}>
          {dateText(s.date)} ·{" "}
          {s.quantity === null ? "—" : qty.format(Number(s.quantity))}
          <small className="price-subtext">
            Отчёт {s.report_id}, строка {s.ordinal + 1}
          </small>
        </p>
      ))}
    </details>
  );
}

function exportImpact(r: Report) {
  const flat = (v: string | null) =>
    v === null ? null : money(v).replace(/\s/g, "");
  const columns = [
    ["dish", "Блюдо"],
    ["status", "Расчёт"],
    ["quantity", "Продано за 30 дней"],
    ["norm", "Товара на порцию"],
    ["norm_unit", "Ед. нормы"],
    ["portion_delta", "Изменение на порцию, ₽"],
    ["weekly_delta", "Изменение за неделю, ₽"],
    ["reason", "Причина исключения / ограничения"],
    ["department", "Заведение"],
    ["price_scope", "Охват закупок"],
    ["product", "Товар"],
    ["unit", "Ед. цены"],
    ["start", "Период с"],
    ["end", "Период по"],
    ["recipe_day", "Дата техкарт"],
    ["old_price", "Средняя цена, ₽"],
    ["new_price", "Последняя цена, ₽"],
    ["history_count", "Поступлений в средней"],
    ["linked", "Связь с расходной"],
    ["charts", "UUID техкарт"],
    ["method", "Допущения"],
  ].map(([key, label]) => ({ key, label }));
  const common = {
    price_scope: r.price.scope_label,
    product: r.price.product,
    unit: r.price.unit,
    start: r.start,
    end: r.end,
    recipe_day: r.recipe_day,
    old_price: flat(r.price.previous.price),
    new_price: flat(r.price.current.price),
    history_count: r.price.previous.count,
    linked: r.price.linked ? "Да" : "Нет",
    method:
      "Текущие техкарты; стандартная порция 1; продажи за 30 дней × 7 / 30; сценарий закупки по последней цене сети",
  };
  csv("Влияние цены — " + r.price.product, columns, [
    ...r.rows.map((d) => {
      const n = norm(d.amount_per_portion, r.norm_unit);
      return {
        ...common,
        ...d,
        status: r.blockers.length ? "Прогноз отключён" : "Включено",
        norm: fmt.format(n.value).replace(/\s/g, ""),
        norm_unit: n.unit,
        portion_delta: flat(d.portion_delta),
        weekly_delta: flat(d.weekly_delta),
        reason: r.blockers.join("; "),
        charts: d.chart_ids.join("; "),
      };
    }),
    ...r.excluded.map((d) => ({
      ...common,
      ...d,
      status: "Исключено",
      reason: d.reasons.join("; "),
      charts: d.chart_ids.join("; "),
    })),
    ...(r.rows.length
      ? [
          {
            ...common,
            dish: "Итого по рассчитанным позициям",
            status: r.blockers.length ? "Прогноз отключён" : "Итого",
            quantity: r.totals.quantity,
            portion_delta: flat(r.totals.average_portion_delta),
            weekly_delta: flat(r.totals.weekly_delta),
            reason: [
              "На порцию — среднее, взвешенное по количеству проданных блюд",
              ...r.blockers,
            ].join("; "),
            department: r.analysis_departments.map((d) => d.name).join("; "),
          },
        ]
      : []),
  ]);
}

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Modal } from "@mantine/core";
import {
  IconArrowRight,
  IconBell,
  IconChartBar,
  IconCheck,
  IconDatabase,
  IconTrendingUp,
} from "@tabler/icons-react";
import { dateText } from "./api";
import { PriceDetails, type PriceChange } from "./PurchasePrices";
import { Feedback } from "./pages";
import type { OverviewData } from "./Overview";
import type { useData } from "./useData";

export type PriceReport = { rows: PriceChange[]; recent_since: string };
type Prices = ReturnType<typeof useData<PriceReport>>;
export const dashboardNumber = (value: string | number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
        Number(value),
      );
const rises = (prices: Prices) =>
  (prices.data?.rows ?? [])
    .filter((row) => row.percent !== null && Number(row.percent) > 0)
    .sort((a, b) => Number(b.percent) - Number(a.percent));

// The targets belong to the app shell, keeping the chat mounted between pages.
export function OverviewPortal({
  target,
  children,
}: {
  target: string;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.getElementById(target));
  }, [target]);
  return host ? createPortal(children, host) : null;
}

export function PriceLeaders({
  prices,
  onOpen,
}: {
  prices: Prices;
  onOpen: (row: PriceChange) => void;
}) {
  const rows = rises(prices).slice(0, 5);
  return (
    <section className="panel overview-price-leaders">
      <div className="panel-heading">
        <h2>Топ-5 роста закупочных цен</h2>
        <Link to="/purchase-prices" className="text-link">
          Все <IconArrowRight size={14} />
        </Link>
      </div>
      <Feedback state={prices}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Товар</th>
                <th className="numeric">Цена</th>
                <th className="numeric">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.product_id + row.unit_id + row.linked}>
                  <td>
                    <button className="inline-link" onClick={() => onOpen(row)}>
                      <span className="overview-product-icon">
                        <IconTrendingUp size={13} />
                      </span>
                      {row.product}
                    </button>
                  </td>
                  <td className="numeric">
                    {dashboardNumber(row.current.price)} ₽/{row.unit}
                  </td>
                  <td className="numeric overview-rise">
                    +{dashboardNumber(row.percent)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="section-note">Рост закупочных цен не найден.</p>
        )}
      </Feedback>
      <details className="overview-top-note overview-method">
        <summary>Как сравниваем цены</summary>
        Последняя цена к средней до 6 предыдущих поступлений. Закупки за
        последние 60 дней, без группы ХОЗНУЖДЫ и связанных перемещений.
      </details>
    </section>
  );
}

export function OverviewNotifications({
  data,
  loading,
  error,
  prices,
  onPrice,
}: {
  data: OverviewData | null;
  loading: boolean;
  error: string;
  prices: Prices;
  onPrice: (row: PriceChange) => void;
}) {
  const alerts: {
    id: string;
    title: string;
    detail: string;
    stamp?: string;
    icon: typeof IconBell;
    href?: string;
    row?: PriceChange;
  }[] = [];
  if (error)
    alerts.push({
      id: "error",
      title: "Не удалось получить показатели",
      detail: "Повторите загрузку обзора",
      icon: IconDatabase,
      href: "/status",
    });
  if (data) {
    const current = data.current;
    if (!current.complete)
      alerts.push({
        id: "coverage",
        title: "Продажи загружены не полностью",
        detail: `${current.loaded_dates.length} из ${current.days} дней · итоги пока недоступны`,
        icon: IconDatabase,
        href: "/status",
      });
    if (current.reconciliation_issues.length)
      alerts.push({
        id: "reconciliation",
        title: "Расхождения в отчётах продаж",
        detail: `Контрольная сверка: ${current.reconciliation_issues.length} расхождений`,
        icon: IconChartBar,
        href: "/sales?kind=daily",
      });
    if (current.partial_days.length)
      alerts.push({
        id: "partial",
        title: "Есть предварительные данные",
        detail: `Дней до окончательного обновления: ${current.partial_days.length}`,
        icon: IconDatabase,
        href: "/status",
      });
    if (!data.dish_current.complete)
      alerts.push({
        id: "dishes",
        title: "Рейтинг блюд ожидает загрузки",
        detail: `Загружено ${data.dish_current.loaded_dates.length} из ${data.dish_current.days} дней`,
        icon: IconDatabase,
        href: "/status",
      });
  }
  const priceRows = rises(prices);
  priceRows.slice(0, 3).forEach((row) =>
    alerts.push({
      id: row.product_id + row.unit_id,
      title: "Рост закупочной цены",
      detail: `${row.product} (+${dashboardNumber(row.percent)}%)`,
      stamp: dateText(row.current.date).split(",")[0],
      icon: IconTrendingUp,
      row,
    }),
  );
  return (
    <section
      className="panel overview-notifications"
      aria-label="Важные уведомления"
    >
      <div className="panel-heading">
        <h2>
          <IconBell size={17} /> Важные уведомления{" "}
          {alerts.length > 0 && (
            <span className="overview-alert-count">{alerts.length}</span>
          )}
        </h2>
        <Link to="/status" aria-label="Статус данных" className="text-link">
          <IconArrowRight size={17} />
        </Link>
      </div>
      <div className="overview-alert-list">
        {alerts.map((alert) => {
          const content = (
            <>
              <span className="overview-alert-icon">
                <alert.icon size={17} />
              </span>
              <span className="overview-alert-text">
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </span>
              {alert.stamp && <time>{alert.stamp}</time>}
            </>
          );
          return alert.row ? (
            <button
              key={alert.id}
              className="overview-alert"
              onClick={() => onPrice(alert.row!)}
            >
              {content}
            </button>
          ) : (
            <Link key={alert.id} className="overview-alert" to={alert.href!}>
              {content}
            </Link>
          );
        })}
        {(loading || prices.loading) && (
          <p className="section-note" role="status">
            Проверяем {loading ? "продажи и цены" : "закупочные цены"}…
          </p>
        )}
        {prices.error && (
          <p className="section-note" role="status">
            Цены пока недоступны.{" "}
            <button className="inline-link" onClick={prices.reload}>
              Повторить
            </button>
          </p>
        )}
        {!loading &&
          !prices.loading &&
          !error &&
          !prices.error &&
          !alerts.length && (
            <p className="section-note">
              <IconCheck size={16} /> Отклонений в загруженных продажах и
              закупочных ценах не найдено.
            </p>
          )}
      </div>
      <p className="overview-top-note">
        Продажи — за выбранный период. Цены — по последним поступлениям;
        показаны до 3 наибольших повышений.
      </p>
    </section>
  );
}

export function OverviewPriceModal({
  row,
  scope,
  onClose,
}: {
  row: PriceChange | null;
  scope: string;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={!!row}
      onClose={onClose}
      size="xl"
      title={row ? `Динамика цены · ${row.product}` : "Динамика цены"}
      closeButtonProps={{ "aria-label": "Закрыть динамику цены" }}
    >
      {row && (
        <PriceDetails
          key={row.product_id + row.unit_id}
          row={row}
          scope={scope}
        />
      )}
    </Modal>
  );
}

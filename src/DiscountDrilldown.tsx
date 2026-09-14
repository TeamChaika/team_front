import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Loader } from "@mantine/core";
import { api, dateText, money, number, type SalesRow } from "./api";
import { useWorkspace } from "./App";

type TopologyTarget = {
  source_id: string;
  order_id: string;
  order_number: number;
  day: string;
  event_count: number;
};
type DetailRow = {
  order_id?: string;
  order_number?: number;
  item_id?: string;
  product_id?: string;
  name?: string;
  discount_name?: string | null;
  quantity?: string;
  revenue: string;
  discount: string;
  topology?: TopologyTarget | null;
  events_state?: string;
};
type Details = {
  kind: "orders" | "items";
  rows: DetailRow[];
  total: number;
  offset: number;
  limit: number;
  observed_at: string;
  discount_name: string;
  selected_order: DetailRow | null;
  reconciliation: {
    matched: boolean;
    checks: {
      field: string;
      expected: string;
      actual: string;
      delta: string;
    }[];
  };
};

function EventLink({ row }: { row: DetailRow }) {
  if (!row.topology)
    return (
      <span className="muted">
        {row.events_state === "ambiguous"
          ? "Неоднозначная связь с журналом"
          : "События заказа не загружены"}
      </span>
    );
  const { source_id, order_id, order_number, day } = row.topology;
  return (
    <Link
      to={
        "/events/topology?" +
        new URLSearchParams({
          source_id,
          order_id,
          order_number: String(order_number),
          day,
        })
      }
    >
      Журнал и топология · {row.topology.event_count} событий
    </Link>
  );
}

export function DiscountDrilldown({ anchor }: { anchor: SalesRow }) {
  const workspace = useWorkspace();
  const scope = workspace.query();
  const [order, setOrder] = useState<DetailRow | null>(null);
  const [offset, setOffset] = useState(0);
  const [attempt, retry] = useState(0);
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const orderId = order?.order_id ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    api<Details>("/discount-details?" + scope, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        report_id: anchor.report_id,
        ordinal: anchor.ordinal,
        order_id: orderId,
        offset,
      }),
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Не удалось получить детализацию.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [anchor.report_id, anchor.ordinal, orderId, offset, attempt, scope]);

  return (
    <section aria-label="Детализация скидки">
      <h3>
        {order ? "Заказ №" + order.order_number : "Заказы с этой скидкой"}
      </h3>
      {order && (
        <Button
          variant="subtle"
          size="xs"
          onClick={() => {
            setOrder(null);
            setOffset(0);
          }}
        >
          ← К списку заказов
        </Button>
      )}
      {loading && (
        <p role="status">
          <Loader size="xs" /> Получаем детализацию…
        </p>
      )}
      {error && (
        <Alert color="red" title="Детализация пока недоступна" role="alert">
          {error}
          <div>
            <Button mt="sm" size="xs" onClick={() => retry((n) => n + 1)}>
              Повторить
            </Button>
          </div>
        </Alert>
      )}
      {data && (
        <>
          {!data.reconciliation.matched && (
            <Alert color="orange" title="Суммы требуют сверки" role="status">
              Детализация получена позднее исходного отчёта. Сохранены суммы из
              обоих ответов.
              <ul>
                {data.reconciliation.checks
                  .filter((c) => Number(c.delta) !== 0)
                  .map((c) => (
                    <li key={c.field}>
                      {c.field === "discount" ? "Скидки" : "Выручка"}: в отчёте{" "}
                      {money(c.expected)} ₽, в детализации {money(c.actual)} ₽.
                    </li>
                  ))}
              </ul>
            </Alert>
          )}
          {data.selected_order && (
            <p>
              <EventLink row={data.selected_order} />
            </p>
          )}
          {data.kind === "items" && (
            <p className="section-note">
              Полный состав заказа. Одна позиция может иметь несколько скидок.
            </p>
          )}
          {!data.total ? (
            <p>По выбранной скидке заказы не найдены.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{data.kind === "orders" ? "Заказ" : "Позиция"}</th>
                    {data.kind === "items" && (
                      <>
                        <th>Количество</th>
                        <th>Скидка</th>
                      </>
                    )}
                    <th className="numeric">Выручка, ₽</th>
                    <th className="numeric">Скидка, ₽</th>
                    {data.kind === "orders" && <th>События</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={row.order_id ?? `${row.item_id}:${i}`}>
                      <td>
                        {data.kind === "orders" ? (
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => {
                              setOrder(row);
                              setOffset(0);
                            }}
                          >
                            Заказ №{row.order_number}
                          </Button>
                        ) : (
                          row.name
                        )}
                      </td>
                      {data.kind === "items" && (
                        <>
                          <td className="numeric">{number(row.quantity)}</td>
                          <td>{row.discount_name || "Без скидки"}</td>
                        </>
                      )}
                      <td className="numeric">{money(row.revenue)}</td>
                      <td className="numeric">{money(row.discount)}</td>
                      {data.kind === "orders" && (
                        <td>
                          <EventLink row={row} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.total > data.limit && (
            <div className="report-summary">
              <Button
                size="xs"
                disabled={data.offset === 0}
                onClick={() => setOffset(Math.max(0, offset - data.limit))}
              >
                Назад
              </Button>
              <span>
                {data.offset + 1}–
                {Math.min(data.offset + data.limit, data.total)} из {data.total}
              </span>
              <Button
                size="xs"
                disabled={data.offset + data.limit >= data.total}
                onClick={() => setOffset(offset + data.limit)}
              >
                Далее
              </Button>
            </div>
          )}
          <p className="section-note">
            Детализация сохранена: {dateText(data.observed_at)}.
          </p>
        </>
      )}
    </section>
  );
}

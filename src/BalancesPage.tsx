import { useState } from "react";
import { Button } from "@mantine/core";
import { useWorkspace } from "./App";
import { useData } from "./useData";
import { type PageData, money, number, dateText } from "./api";
import { PageTitle, Feedback, DataTable, ExportButton } from "./pages";
import { BalanceSearch } from "./BalanceSearch";

type Warehouse = {
  id: string;
  name: string;
  department: string | null;
  product_count: number;
  row_count: number;
  value: string | null;
};
type BalanceData = PageData & {
  stores: Warehouse[];
  accounting_timestamp: string | null;
  filtered_value: string | null;
};
export function BalancesPage() {
  const w = useWorkspace();
  // Restaurant changes remount all filters, including pending product suggestions.
  return <BalanceWorkspace key={w.query()} scope={w.query()} />;
}
function BalanceWorkspace({ scope }: { scope: string }) {
  const [store, setStore] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({
    q: "",
    product: null as string | null,
  });
  const [offset, setOffset] = useState(0);
  const storeScope = scope + (store ? "&store_id=" + store : "");
  const state = useData<BalanceData>(
    "/resources/balances?" +
      storeScope +
      "&offset=" +
      offset +
      (filter.product
        ? "&product_id=" + filter.product
        : "&q=" + encodeURIComponent(filter.q)),
  );
  // Keep warehouse controls in place while searching or paging; reset on restaurant change.
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stamp, setStamp] = useState<string | null>(null);
  const [seen, setSeen] = useState<BalanceData | null>(null);
  if (state.data && state.data !== seen) {
    setSeen(state.data);
    setWarehouses(state.data.stores);
    setStamp(state.data.accounting_timestamp);
  }
  const selected = warehouses.find((row) => row.id === store);
  function chooseStore(id: string | null) {
    setStore(id);
    setOffset(0);
    setSearch("");
    setFilter({ q: "", product: null });
  }
  function find() {
    if (filter.product) return;
    setFilter({ q: search, product: null });
    setOffset(0);
  }
  const groups = [...new Set(warehouses.map((row) => row.department))];
  return (
    <>
      <PageTitle
        title="Остатки на складах"
        subtitle="Выберите склад, чтобы увидеть его товары. Подсказки помогут найти точную позицию номенклатуры."
      />
      <div className="data-notice">
        {stamp ? "Снимок: " + dateText(stamp) + ". " : ""}Остатки на момент
        снимка; фильтр периода не применяется.
      </div>
      {warehouses.length > 0 && (
        <details
          className="warehouse-overview"
          aria-label="Склады и итоги"
          open={Boolean(scope)}
        >
          <summary>Склады по заведениям · {warehouses.length}</summary>
          <div className="warehouse-heading">
            <h2>Склады</h2>
            <Button
              variant={store === null ? "light" : "default"}
              aria-pressed={store === null}
              onClick={() => chooseStore(null)}
            >
              Все склады
            </Button>
          </div>
          <p className="section-note">
            Стоимость всех остатков и число товаров на каждом складе, до
            применения поиска.
          </p>
          {groups.map((group) => (
            <div key={group ?? "unmapped"}>
              <h3>{group ?? "Без подтверждённого заведения"}</h3>
              <div className="warehouse-grid">
                {warehouses
                  .filter((row) => row.department === group)
                  .map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      className={
                        "warehouse-card" + (store === row.id ? " selected" : "")
                      }
                      aria-pressed={store === row.id}
                      onClick={() => chooseStore(row.id)}
                    >
                      <span>{row.name}</span>
                      <strong>
                        {row.row_count
                          ? money(row.value) + " ₽"
                          : "Нет строк в снимке"}
                      </strong>
                      <small>
                        {number(row.product_count)} товаров ·{" "}
                        {number(row.row_count)} строк
                      </small>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </details>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>{selected ? selected.name : "Товары на всех складах"}</h2>
        </div>
        <div className="resource-tools">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              find();
            }}
          >
            <BalanceSearch
              key={storeScope}
              scope={storeScope}
              value={search}
              onChange={(value) => {
                setSearch(value);
                if (filter.product || !value) {
                  setFilter({ q: "", product: null });
                  setOffset(0);
                }
              }}
              onSelect={(product) => {
                setSearch(product.name);
                setFilter({ q: "", product: product.id });
                setOffset(0);
              }}
            />
            <Button
              type="submit"
              variant="light"
              onClick={(e) => {
                // A selected suggestion remains an exact ID filter when pressing Find.
                if (filter.product) e.preventDefault();
              }}
            >
              Найти
            </Button>
            {(search || filter.product || filter.q) && (
              <Button
                variant="subtle"
                onClick={() => {
                  setSearch("");
                  setFilter({ q: "", product: null });
                  setOffset(0);
                }}
              >
                Сбросить
              </Button>
            )}
          </form>
          <ExportButton
            name="stock-balances"
            columns={state.data?.columns ?? []}
            rows={state.data?.rows ?? []}
            label="CSV страницы"
          />
        </div>
        {filter.product && (
          <p className="section-note balance-filter-note">
            Выбрана точная позиция: {search}
          </p>
        )}
        <Feedback state={state}>
          {state.data && (
            <>
              <div className="balance-selection-total">
                Стоимость по выбранным условиям:{" "}
                <strong>{money(state.data.filtered_value)} ₽</strong> ·{" "}
                {number(state.data.total)} строк
              </div>
              <DataTable
                columns={state.data.columns}
                rows={state.data.rows}
                firstLink={(row) => "/products/" + row.id}
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
                    onClick={() => setOffset(Math.max(0, offset - 50))}
                  >
                    Назад
                  </Button>{" "}
                  <Button
                    variant="default"
                    size="xs"
                    disabled={offset + 50 >= state.data.total}
                    onClick={() => setOffset(offset + 50)}
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

import { Fragment, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Loader,
  Menu,
  Pagination,
  TextInput,
} from "@mantine/core";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { useWorkspace } from "./App";
import { dateText, money } from "./api";
import { useData } from "./useData";
import { RestaurantPicker } from "./RestaurantPicker";
import { drilldownDepartments, venueScope } from "./venueArchiveModel";
import {
  canChangeExpense,
  categories,
  expenseQuery,
  financeDepartments,
  moscowToday,
  paymentMethods,
  periodForMonth,
  type Expense,
  type FinanceAccess,
  type ProfitReport,
} from "./profitLossModel";
import ExpenseEditor from "./ExpenseEditor";
import { CancelExpense, ExpenseHistory } from "./ExpenseDetails";
import "./profitLoss.css";

function currency(value: string | null) {
  return value == null ? "—" : money(value) + " ₽";
}
function Summary({
  query,
  version,
  syncedCount,
  selectSynced,
}: {
  query: string;
  version: string;
  syncedCount: number;
  selectSynced: () => void;
}) {
  const { data, loading, error, reload } = useData<ProfitReport>(
    "/profit-loss/report?" + query,
    true,
    version,
  );
  if (error)
    return (
      <Alert color="red" role="alert">
        {error}{" "}
        <Button variant="subtle" size="xs" onClick={reload}>
          Повторить
        </Button>
      </Alert>
    );
  if (loading || !data)
    return <Loader size="sm" aria-label="Загрузка отчёта" />;
  const metrics: [string, string | null][] = [
    ["Выручка", data.revenue],
    ["Себестоимость продаж", data.cost],
    ["Валовая прибыль", data.gross_profit],
    ["Операционные расходы", data.expenses],
    ["Операционная прибыль", data.operating_profit],
  ];
  return (
    <section aria-label="Финансовый результат" className="pl-summary">
      <div className="pl-metrics">
        {metrics.map(([label, value]) => (
          <div key={label} className="pl-metric">
            <span>{label}</span>
            <strong>{currency(value)}</strong>
            {label === "Операционная прибыль" && (
              <small className="muted">По внесённым расходам</small>
            )}
          </div>
        ))}
      </div>
      {!data.complete ? (
        <div>
          <p className="muted">
            Данные iiko за период неполные. Сумма внесённых расходов доступна.
          </p>
          {syncedCount > 0 && (
            <Button variant="light" size="xs" mt="xs" onClick={selectSynced}>
              Выбрать заведения с синхронизацией iiko ({syncedCount})
            </Button>
          )}
        </div>
      ) : (
        data.provisional && (
          <p className="muted">В период входят предварительные данные iiko.</p>
        )
      )}
      <details className="panel pl-breakdown">
        <summary>Начисленные расходы по статьям и способам оплаты</summary>
        <div className="pl-breakdown-grid">
          <section>
            <h3>Статья</h3>
            <dl>
              {data.by_category.map(({ category, amount }) => (
                <div key={category}>
                  <dt>{categories[category] ?? category}</dt>
                  <dd>{currency(amount)}</dd>
                </div>
              ))}
            </dl>
            {data.by_category.length === 0 && (
              <p className="muted">Пока нет расходов</p>
            )}
          </section>
          <section>
            <h3>Способ оплаты</h3>
            <dl>
              <div>
                <dt>Наличные</dt>
                <dd>{currency(data.cash)}</dd>
              </div>
              <div>
                <dt>Безналичные</dt>
                <dd>{currency(data.bank)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </details>
    </section>
  );
}

type Dialog =
  | { action: "create" }
  | { action: "edit" | "history" | "cancel"; row: Expense };
const PAGE_SIZE = 25;
function Journal({
  query,
  access,
  version,
  setDialog,
}: {
  query: string;
  access: FinanceAccess;
  version: string;
  setDialog: (dialog: Dialog) => void;
}) {
  const [page, setPage] = useState(1);
  const path =
    "/profit-loss/expenses?" +
    query +
    "&limit=" +
    PAGE_SIZE +
    "&offset=" +
    (page - 1) * PAGE_SIZE;
  const { data, loading, error, reload } = useData<{
    rows: Expense[];
    total: number;
  }>(path, false, version);
  return (
    <section className="panel pl-journal">
      <div className="panel-heading">
        <h2>{access === "manager" ? "Мои расходы" : "Журнал расходов"}</h2>
        {data && (
          <span className="muted">Записей за период · {data.total}</span>
        )}
      </div>
      {error && (
        <Alert color="red" role="alert">
          {error}{" "}
          <Button variant="subtle" size="xs" onClick={reload}>
            Повторить
          </Button>
        </Alert>
      )}
      {loading && (
        <div className="pl-empty">
          <Loader size="sm" aria-label="Загрузка журнала" />
        </div>
      )}
      {data && !loading && !data.rows.length && (
        <div className="pl-empty">За выбранный период расходов нет.</div>
      )}
      {data && !loading && data.rows.length > 0 && (
        <table className="pl-table">
          <thead>
            <tr>
              <th scope="col" aria-sort="descending">
                Дата расхода ↓
              </th>
              <th scope="col">Статья и заведение</th>
              <th scope="col">Оплата</th>
              <th scope="col">Автор</th>
              <th scope="col" className="numeric">
                Сумма, ₽
              </th>
              <th scope="col" aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.id}
                className={row.cancelled ? "pl-cancelled" : undefined}
              >
                <td className="pl-date">{dateText(row.expense_date)}</td>
                <td className="pl-subject">
                  <strong>{categories[row.category] ?? row.category}</strong>
                  <small>{row.department}</small>
                  {row.comment && (
                    <span className="pl-note">{row.comment}</span>
                  )}
                </td>
                <td className="pl-payment">
                  {paymentMethods[row.payment_method]}
                  <small>
                    {row.cancelled
                      ? "Аннулирован"
                      : row.paid_date
                        ? "Оплачен · " + dateText(row.paid_date)
                        : "Ожидает оплаты"}
                  </small>
                </td>
                <td className="pl-author">{row.author}</td>
                <td className="numeric pl-amount">{money(row.amount)}</td>
                <td className="pl-actions">
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        aria-label={`Действия с расходом ${categories[row.category]} за ${dateText(row.expense_date)}`}
                      >
                        <IconDots size={17} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        onClick={() => setDialog({ action: "history", row })}
                      >
                        История
                      </Menu.Item>
                      {canChangeExpense(access, row) && (
                        <>
                          <Menu.Item
                            onClick={() => setDialog({ action: "edit", row })}
                          >
                            Изменить
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            onClick={() => setDialog({ action: "cancel", row })}
                          >
                            Аннулировать
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.total > PAGE_SIZE && (
        <Pagination
          aria-label="Страницы журнала"
          className="pl-pagination"
          value={page}
          onChange={setPage}
          total={Math.ceil(data.total / PAGE_SIZE)}
        />
      )}
    </section>
  );
}

export default function ProfitLoss({ access }: { access: FinanceAccess }) {
  const {
    meta,
    departments,
    setDepartments,
    includeArchived,
    setIncludeArchived,
  } = useWorkspace();
  const today = meta.today || moscowToday();
  const [range, setRange] = useState(() =>
    periodForMonth(today.slice(0, 7), today),
  );
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const venues = financeDepartments(meta.departments).map((venue) => ({
    ...venue,
    archived: venue.archived || venue.present_in_latest === false,
  }));
  const scope = venueScope(venues, departments, includeArchived);
  const writable = venues.filter(
    (v) => !v.archived && v.present_in_latest === true,
  );
  const selectedVenue =
    scope.selected.length === 1 &&
    writable.some((v) => v.id === scope.selected[0])
      ? scope.selected[0]
      : writable.length === 1
        ? writable[0].id
        : "";
  const reportDepartments = drilldownDepartments(scope.venues, scope.selected);
  const synced = scope.venues
    .filter((v) => v.sync_enabled === true && reportDepartments.includes(v.id))
    .map((v) => v.id);
  const query = expenseQuery(range, reportDepartments);
  function selectMonth(value: string) {
    setMonth(value);
    if (value) setRange(periodForMonth(value, today));
  }
  function selectDate(field: "start" | "end", value: string) {
    setMonth("");
    setRange((current) => ({ ...current, [field]: value }));
  }
  const close = () => setDialog(null);
  const reload = () => setVersion((v) => v + 1);
  function saved() {
    setNotice(
      dialog?.action === "cancel" ? "Расход аннулирован." : "Расход сохранён.",
    );
    close();
    reload();
  }
  function open(next: Dialog) {
    setNotice("");
    setDialog(next);
  }
  return (
    <div className="profit-loss">
      <div className="pl-heading">
        <h1>Прибыли и убытки</h1>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => open({ action: "create" })}
          disabled={!writable.length}
        >
          Добавить расход
        </Button>
      </div>
      <div className="panel pl-filters">
        <div className="pl-venues">
          <span>Заведения</span>
          <RestaurantPicker
            restaurants={scope.venues}
            value={scope.selected}
            onChange={setDepartments}
          />
        </div>
        <TextInput
          type="month"
          label="Месяц"
          value={month}
          onChange={(e) => selectMonth(e.currentTarget.value)}
          onInput={(e) => selectMonth(e.currentTarget.value)}
        />
        <TextInput
          type="date"
          label="С"
          value={range.start}
          onChange={(e) => selectDate("start", e.currentTarget.value)}
          onInput={(e) => selectDate("start", e.currentTarget.value)}
        />
        <TextInput
          type="date"
          label="По"
          value={range.end}
          min={range.start}
          onChange={(e) => selectDate("end", e.currentTarget.value)}
          onInput={(e) => selectDate("end", e.currentTarget.value)}
        />
        {venues.some((v) => v.archived) && (
          <Checkbox
            label="Показать архивные"
            checked={includeArchived}
            onChange={(e) => {
              const show = e.currentTarget.checked;
              if (!show)
                setDepartments(venueScope(venues, departments, false).selected);
              setIncludeArchived(show);
            }}
          />
        )}
      </div>
      {notice && (
        <p role="status" className="pl-notice">
          {notice}
        </p>
      )}
      {query ? (
        <Fragment key={query}>
          {access === "owner" &&
            (range.end <= today ? (
              <Summary
                query={query}
                version={String(version)}
                syncedCount={
                  synced.length < reportDepartments.length ? synced.length : 0
                }
                selectSynced={() => setDepartments(synced)}
              />
            ) : (
              <p className="muted">
                Для расчёта прибыли выберите период по сегодняшнюю дату.
              </p>
            ))}
          <Journal
            query={query}
            version={String(version)}
            access={access}
            setDialog={open}
          />
        </Fragment>
      ) : (
        <p className="muted">
          {scope.empty
            ? "Нет доступных заведений в этом фильтре."
            : "Выберите период продолжительностью от 1 до 366 дней."}
        </p>
      )}
      {(dialog?.action === "create" || dialog?.action === "edit") && (
        <ExpenseEditor
          row={dialog.action === "edit" ? dialog.row : null}
          today={today}
          venues={writable}
          selectedVenue={selectedVenue}
          onClose={close}
          onSaved={saved}
          onConflict={reload}
        />
      )}
      {dialog?.action === "history" && (
        <ExpenseHistory row={dialog.row} onClose={close} />
      )}
      {dialog?.action === "cancel" && (
        <CancelExpense
          row={dialog.row}
          onClose={close}
          onSaved={saved}
          onConflict={reload}
        />
      )}
    </div>
  );
}

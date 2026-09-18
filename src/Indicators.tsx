import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Loader,
  Menu,
  Modal,
  Switch,
  TextInput,
} from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconEyeOff,
  IconFilter,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { api, dateText, type LiveSource } from "./api";
import { useWorkspace } from "./App";
import "./indicators.css";

type Metric = { key: string; label: string; unit?: string; duration?: boolean };
const metrics: Metric[] = [
  { key: "quantity", label: "Количество блюд" },
  { key: "checks", label: "Заказов" },
  { key: "guests", label: "Количество гостей" },
  { key: "revenue", label: "Сумма со скидкой", unit: "₽" },
  { key: "average_check", label: "Средний чек", unit: "₽" },
  { key: "markup", label: "Наценка", unit: "%" },
  { key: "gross_profit", label: "Наценка", unit: "₽" },
  { key: "discount_percent", label: "Процент скидки", unit: "%" },
  { key: "discount", label: "Сумма скидки", unit: "₽" },
  { key: "cost_share", label: "Себестоимость", unit: "%" },
  { key: "cost", label: "Себестоимость", unit: "₽" },
  { key: "return_sum", label: "Сумма возврата", unit: "₽" },
  { key: "guests_per_check", label: "Гостей на чек" },
  { key: "precheck_minutes", label: "Время в пречеке", duration: true },
];
type Filter = { key: string; label: string; default: string[] };
type Filters = Record<string, string[]>;
type Period = {
  date: string;
  totals: Record<string, string | number | null>;
  available: boolean;
  partial: boolean;
  observed_at: string | null;
};
type Report = {
  current: Period;
  previous: Period;
  source: string;
  live?: LiveSource | null;
  warning?: string | null;
  cache_seconds?: number;
};
type Preferences = { order: string[]; hidden: string[] };
const defaultOrder = metrics.map((m) => m.key);
const defaults: Filters = {
  dish_deleted: ["NOT_DELETED"],
  order_deleted: ["NOT_DELETED"],
};
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const labels: Record<string, string> = {
  NOT_DELETED: "Не удалено",
  DELETED_WITH_WRITEOFF: "Удалено со списанием",
  DELETED_WITHOUT_WRITEOFF: "Удалено без списания",
  TRUE: "Да",
  FALSE: "Нет",
  true: "Да",
  false: "Нет",
  DINE_IN: "В заведении",
  COURIER: "Курьером",
  PICKUP: "Самовывоз",
  DISH: "Блюдо",
  GOODS: "Товар",
  PREPARED: "Заготовка",
  MODIFIER: "Модификатор",
  SERVICE: "Услуга",
};
function shift(day: string, count: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function display(value: unknown, metric: Metric) {
  if (value === null || value === undefined || !Number.isFinite(Number(value)))
    return "—";
  if (metric.duration) {
    const seconds = Math.round(Number(value) * 60);
    return `${Math.floor(seconds / 3600)
      .toString()
      .padStart(
        2,
        "0",
      )}:${Math.floor(seconds / 60) % 60 < 10 ? "0" : ""}${Math.floor(seconds / 60) % 60}:${(seconds % 60).toString().padStart(2, "0")}`;
  }
  return number.format(Number(value)) + (metric.unit ? ` ${metric.unit}` : "");
}
function parameters(ids: string[]) {
  const query = new URLSearchParams();
  ids.forEach((id) => query.append("department_id", id));
  return query.toString();
}
function loadPreferences(key: string): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && Array.isArray(saved.order) && Array.isArray(saved.hidden))
      return {
        order: [
          ...new Set([
            ...saved.order.filter((id: string) => defaultOrder.includes(id)),
            ...defaultOrder,
          ]),
        ],
        hidden: saved.hidden.filter((id: string) => defaultOrder.includes(id)),
      };
  } catch {
    /* Storage is optional; the dashboard still works in private browsing. */
  }
  return { order: defaultOrder, hidden: ["precheck_minutes"] };
}

export function Indicators() {
  const { meta, departments, setDepartments } = useWorkspace();
  const storageKey = `chaika:indicators:v1:${meta.user.id}`;
  const [preferences, setPreferences] = useState(() =>
    loadPreferences(storageKey),
  );
  const [day, setDay] = useState(meta.today || meta.sales_dates[0]);
  const [filters, setFilters] = useState<Filters>({});
  const [direct, setDirect] = useState(false);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<Report | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [catalog, setCatalog] = useState<Filter[]>([]);
  const [filterOpen, setFilterOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>({}),
    [draftDepartments, setDraftDepartments] = useState<string[]>([]);
  const [field, setField] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [options, setOptions] = useState<string[]>([]),
    [optionBusy, setOptionBusy] = useState(false),
    [optionError, setOptionError] = useState("");
  const [optionRevision, setOptionRevision] = useState(0);
  const [detail, setDetail] = useState<Metric | null>(null);
  const query = parameters(departments),
    draftQuery = parameters(draftDepartments);
  const filterJson = JSON.stringify(filters),
    draftJson = JSON.stringify(draft);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Preferences are optional. */
    }
  }, [storageKey, preferences]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ filters: Filter[] }>("/indicators/filters", {
      signal: controller.signal,
    })
      .then((r) => setCatalog(r.filters))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setReport(null);
    setDetail(null);
    api<Report>(`/indicators/query?${query}`, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ day, filters: JSON.parse(filterJson), direct }),
    })
      .then((r) => {
        if (!controller.signal.aborted) setReport(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [day, query, filterJson, direct, revision]);
  useEffect(() => {
    if (!filterOpen || !field || field === "restaurants") return;
    const controller = new AbortController();
    setOptions([]);
    setOptionError("");
    setOptionBusy(true);
    api<{ values: string[] }>(`/indicators/options/${field}?${draftQuery}`, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ day, filters: JSON.parse(draftJson) }),
    })
      .then((r) => {
        if (!controller.signal.aborted) setOptions(r.values);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setOptionError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setOptionBusy(false);
      });
    return () => controller.abort();
  }, [field, filterOpen, day, draftQuery, optionRevision]); // Draft selections apply on the next filter or explicit retry.
  const activeFilters = Object.entries(filters).filter(
    ([key, values]) =>
      JSON.stringify(values) !== JSON.stringify(defaults[key] || []),
  );
  const names = new Map(meta.departments.map((d) => [d.id, d.name]));
  const restaurantLabel = departments.length
    ? departments
        .map((id) => names.get(id))
        .filter(Boolean)
        .join(", ")
    : "Вся сеть";
  const ordered = preferences.order.map(
    (key) => metrics.find((m) => m.key === key)!,
  );
  function move(key: string, direction: number) {
    setPreferences((p) => {
      const order = [...p.order],
        i = order.indexOf(key),
        j = i + direction;
      if (j >= 0 && j < order.length)
        [order[i], order[j]] = [order[j], order[i]];
      return { ...p, order };
    });
  }
  function hide(key: string) {
    setPreferences((p) => ({ ...p, hidden: [...new Set([...p.hidden, key])] }));
  }
  function openFilters() {
    setDraft(structuredClone(filters));
    setDraftDepartments([...departments]);
    setField(null);
    setSearch("");
    setFilterOpen(true);
  }
  const observed = report?.live?.observed_at || report?.current.observed_at;
  const selectedValues =
    field === "restaurants"
      ? draftDepartments
      : field
        ? (draft[field] ?? defaults[field] ?? [])
        : [];
  function toggle(value: string) {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value].sort();
    if (field === "restaurants") setDraftDepartments(next);
    else if (field) setDraft((d) => ({ ...d, [field]: next }));
  }
  const choiceList =
    field === "restaurants"
      ? meta.departments.map((d) => ({ value: d.id, label: d.name }))
      : [...new Set([...options, ...selectedValues])].map((v) => ({
          value: v,
          label: labels[v] || v,
        }));
  const match = (text: string) =>
    text
      .toLocaleLowerCase("ru")
      .replaceAll("ё", "е")
      .includes(search.toLocaleLowerCase("ru").replaceAll("ё", "е"));
  return (
    <section className="indicators-page">
      <div className="indicators-heading">
        <div>
          <h1>Показатели</h1>
          <button className="indicators-scope" onClick={openFilters}>
            {restaurantLabel}
            <IconChevronRight size={14} />
          </button>
        </div>
        <div className="indicators-actions">
          <button
            aria-label="Обновить показатели"
            onClick={() => setRevision((v) => v + 1)}
            disabled={busy}
          >
            <IconRefresh size={20} />
          </button>
          <button
            aria-label="Настроить карточки"
            onClick={() => setSettingsOpen(true)}
          >
            <IconAdjustmentsHorizontal size={20} />
          </button>
          <button
            aria-label="Фильтры показателей"
            className={
              activeFilters.length || departments.length ? "active" : ""
            }
            onClick={openFilters}
          >
            <IconFilter size={20} />
            {activeFilters.length > 0 && <small>{activeFilters.length}</small>}
          </button>
        </div>
      </div>
      <div className="indicators-datebar">
        <button
          aria-label="Предыдущий день"
          disabled={day <= "2000-01-02"}
          onClick={() => setDay(shift(day, -1))}
        >
          <IconChevronLeft />
        </button>
        <div>
          <input
            aria-label="Дата показателей"
            type="date"
            value={day}
            min="2000-01-02"
            max={meta.today}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value);
            }}
          />
          <span>Сравнение: {dateText(shift(day, -1))}</span>
        </div>
        <button
          aria-label="Следующий день"
          disabled={!meta.today || day >= meta.today}
          onClick={() => setDay(shift(day, 1))}
        >
          <IconChevronRight />
        </button>
        <Button
          size="xs"
          variant="subtle"
          onClick={() => meta.today && setDay(meta.today)}
        >
          Сегодня
        </Button>
      </div>
      {activeFilters.length > 0 && (
        <div className="indicators-chips">
          {activeFilters.map(([key, values]) => (
            <button key={key} onClick={openFilters}>
              {catalog.find((f) => f.key === key)?.label || key}:{" "}
              {values.length
                ? values.map((v) => labels[v] || v).join(", ")
                : "Все"}
            </button>
          ))}
          <button
            aria-label="Сбросить дополнительные фильтры"
            onClick={() => {
              setFilters({});
              setDirect(false);
            }}
          >
            <IconX size={14} />
            Сбросить
          </button>
        </div>
      )}
      {error && (
        <Alert color="red" role="alert">
          {error}
          <Button
            size="xs"
            variant="subtle"
            onClick={() => setRevision((v) => v + 1)}
          >
            Повторить
          </Button>
        </Alert>
      )}
      {busy && (
        <div className="indicators-loading" role="status">
          <Loader size="sm" />
          Загружаем показатели…
        </div>
      )}
      {report && (
        <>
          <div className="indicators-freshness">
            <span>
              {report.live || report.source === "iiko_api"
                ? "iiko · кеш 5 мин"
                : "Сохранённые данные"}
              {observed ? ` · ${dateText(observed)}` : ""}
            </span>
            {report.current.partial && <span>День ещё не завершён</span>}
          </div>
          {(report.warning || report.live?.stale) && (
            <Alert color="yellow">
              {report.warning ||
                "Показана сохранённая копия ответа iiko. Обновление временно недоступно."}
            </Alert>
          )}
          {!report.current.available && (
            <Alert color="yellow">
              За {dateText(day)} данные ещё не загружены.
            </Alert>
          )}
          <div className="indicators-grid">
            {ordered
              .filter((m) => !preferences.hidden.includes(m.key))
              .map((metric) => (
                <article className="indicator-card" key={metric.key}>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <button
                        className="indicator-menu"
                        aria-label={`Настроить: ${metric.label}${metric.unit ? `, ${metric.unit}` : ""}`}
                      >
                        <IconDotsVertical size={17} />
                      </button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconArrowUp size={14} />}
                        disabled={preferences.order[0] === metric.key}
                        onClick={() => move(metric.key, -1)}
                      >
                        Выше
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconArrowDown size={14} />}
                        disabled={preferences.order.at(-1) === metric.key}
                        onClick={() => move(metric.key, 1)}
                      >
                        Ниже
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconEyeOff size={14} />}
                        onClick={() => hide(metric.key)}
                      >
                        Скрыть
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                  <button
                    className="indicator-values"
                    onClick={() => setDetail(metric)}
                    aria-label={`${metric.label}${metric.unit ? `, ${metric.unit}` : ""}: сравнить дни`}
                  >
                    <span className="indicator-label">
                      {metric.label}
                      {metric.unit === "%"
                        ? ", %"
                        : metric.key === "gross_profit"
                          ? ", ₽"
                          : ""}
                    </span>
                    <strong className="indicator-current">
                      {display(report.current.totals[metric.key], metric)}
                    </strong>
                    <span className="indicator-previous">
                      {display(report.previous.totals[metric.key], metric)}
                    </span>
                  </button>
                </article>
              ))}
          </div>
          {preferences.hidden.length === metrics.length && (
            <Button variant="light" onClick={() => setSettingsOpen(true)}>
              Добавить показатели
            </Button>
          )}
          <div className="indicators-legend">
            <span>● {dateText(day)}</span>
            <span>
              ● {dateText(report.previous.date)} ·{" "}
              {report.previous.available
                ? report.previous.partial
                  ? "неполная выгрузка"
                  : "полный день"
                : "нет данных"}
            </span>
          </div>
          {!report.previous.available && (
            <p className="muted">За день сравнения данные ещё не загружены.</p>
          )}
        </>
      )}
      <Drawer
        opened={filterOpen}
        onClose={() => setFilterOpen(false)}
        position="right"
        size="md"
        closeButtonProps={{ "aria-label": "Закрыть фильтры" }}
        title={
          field ? (
            <button
              className="indicators-back"
              onClick={() => {
                setField(null);
                setSearch("");
              }}
            >
              <IconChevronLeft size={20} />
              {field === "restaurants"
                ? "Точка продаж"
                : catalog.find((f) => f.key === field)?.label}
            </button>
          ) : (
            "Фильтры"
          )
        }
        className="indicators-drawer"
      >
        {field ? (
          <>
            <TextInput
              aria-label="Поиск значения фильтра"
              placeholder="Поиск…"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <button
              className="indicators-filter-reset"
              onClick={() =>
                field === "restaurants"
                  ? setDraftDepartments([])
                  : setDraft((d) => ({ ...d, [field]: [] }))
              }
            >
              Все значения · сбросить выбор
            </button>
            {field === "restaurants" && !draftDepartments.length && (
              <p className="muted">Выбрана вся доступная сеть</p>
            )}
            {optionBusy && field !== "restaurants" && (
              <div className="indicators-loading" role="status">
                <Loader size="sm" />
                Получаем значения из iiko…
              </div>
            )}
            {optionError && field !== "restaurants" && (
              <Alert color="red">
                {optionError}
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => setOptionRevision((v) => v + 1)}
                >
                  Повторить
                </Button>
              </Alert>
            )}
            <div className="indicators-options">
              {choiceList
                .filter((v) => match(v.label))
                .map((v) => (
                  <Checkbox
                    key={v.value}
                    label={v.label}
                    checked={selectedValues.includes(v.value)}
                    onChange={() => toggle(v.value)}
                  />
                ))}
            </div>
            {!optionBusy &&
              !optionError &&
              !choiceList.filter((v) => match(v.label)).length && (
                <p className="muted">
                  Нет значений за выбранные дни с этими фильтрами.
                </p>
              )}
          </>
        ) : (
          <div className="indicators-filter-list">
            <button
              onClick={() => {
                setField("restaurants");
                setSearch("");
              }}
            >
              <span>
                Точка продаж
                <small>
                  {draftDepartments.length
                    ? draftDepartments.map((id) => names.get(id)).join(", ")
                    : "Вся сеть"}
                </small>
              </span>
              <IconChevronRight size={18} />
            </button>
            {catalog.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setField(f.key);
                  setSearch("");
                }}
              >
                <span>
                  {f.label}
                  <small>
                    {(draft[f.key] ?? f.default)
                      .map((v) => labels[v] || v)
                      .join(", ") || "Все"}
                  </small>
                </span>
                <IconChevronRight size={18} />
              </button>
            ))}
            {!catalog.length && (
              <Alert color="yellow">
                Не удалось загрузить список дополнительных фильтров. Обновите
                страницу.
              </Alert>
            )}
          </div>
        )}
        <div className="indicators-drawer-footer">
          <Button
            variant="subtle"
            onClick={() => {
              setDraft({});
              setDraftDepartments([]);
              setField(null);
            }}
          >
            Сбросить всё
          </Button>
          <Button
            onClick={() => {
              setFilters(draft);
              setDepartments(draftDepartments);
              setDirect(false);
              setFilterOpen(false);
            }}
          >
            Применить
          </Button>
        </div>
      </Drawer>
      <Modal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Карточки показателей"
        closeButtonProps={{ "aria-label": "Закрыть настройки карточек" }}
        centered
      >
        <div className="indicators-settings">
          {ordered.map((m, i) => (
            <div key={m.key}>
              <Switch
                label={m.label + (m.unit ? `, ${m.unit}` : "")}
                checked={!preferences.hidden.includes(m.key)}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked;
                  setPreferences((p) => ({
                    ...p,
                    hidden: enabled
                      ? p.hidden.filter((k) => k !== m.key)
                      : [...p.hidden, m.key],
                  }));
                }}
              />
              <button
                aria-label={`Выше: ${m.label}`}
                disabled={!i}
                onClick={() => move(m.key, -1)}
              >
                <IconArrowUp size={17} />
              </button>
              <button
                aria-label={`Ниже: ${m.label}`}
                disabled={i === ordered.length - 1}
                onClick={() => move(m.key, 1)}
              >
                <IconArrowDown size={17} />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="subtle"
          onClick={() =>
            setPreferences({
              order: defaultOrder,
              hidden: ["precheck_minutes"],
            })
          }
        >
          Вернуть исходный вид
        </Button>
      </Modal>
      <Modal
        opened={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.label}
        closeButtonProps={{ "aria-label": "Закрыть сравнение" }}
        centered
      >
        {detail && report && (
          <div className="indicator-detail">
            {[report.current, report.previous].map((period, index) => {
              const value = period.totals[detail.key],
                max = Math.max(
                  Math.abs(Number(report.current.totals[detail.key] || 0)),
                  Math.abs(Number(report.previous.totals[detail.key] || 0)),
                  1,
                );
              return (
                <div
                  key={period.date}
                  className={index ? "previous" : "current"}
                >
                  <span>
                    {dateText(period.date)}
                    {period.partial ? " · день не завершён" : ""}
                  </span>
                  <strong>{display(value, detail)}</strong>
                  <div className="indicator-bar-track">
                    <i
                      style={{
                        width: `${(Math.abs(Number(value || 0)) / max) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {detail.duration &&
              report.current.totals.precheck_minutes == null && (
                <>
                  <p className="muted">
                    В сохранённой выгрузке нет времени в пречеке. Его можно
                    запросить отдельно из iiko.
                  </p>
                  <Button
                    onClick={() => {
                      setDetail(null);
                      setDirect(true);
                      setRevision((v) => v + 1);
                    }}
                  >
                    Запросить показатели из iiko
                  </Button>
                </>
              )}
          </div>
        )}
      </Modal>
    </section>
  );
}

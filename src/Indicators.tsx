import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Loader,
  Menu,
  Modal,
  Switch,
  Select,
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
import { api, dateText } from "./api";
import { useWorkspace } from "./App";
import "./indicators.css";
import { periods, presets, type Preset } from "./indicatorPeriods";

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
  start: string;
  end: string;
  value: string | number | null;
  partial: boolean;
  observed_at: string | null;
};
type Report = {
  status: "ready";
  current: Period;
  previous: Period;
  source: string;
  observed_at: string;
};
type Pending = { status: "loading"; retry_after: number };
type CardState = { report?: Report; error?: string };
type Dictionary = {
  filters: Filter[];
  options: Record<string, string[]>;
  sync: Record<string, { synced_at: string }>;
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
function rangeLabel(start: string, end: string) {
  return start === end
    ? dateText(start)
    : `${dateText(start)} — ${dateText(end)}`;
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
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
  return { order: defaultOrder, hidden: [] };
}

export function Indicators() {
  const { meta, departments, setDepartments } = useWorkspace();
  const storageKey = `chaika:indicators:v1:${meta.user.id}`;
  const [preferences, setPreferences] = useState(() =>
    loadPreferences(storageKey),
  );
  const today = meta.today || meta.sales_dates[0];
  const [preset, setPreset] = useState<Preset>("today");
  const [custom, setCustom] = useState({ start: today, end: today });
  const [draftRange, setDraftRange] = useState(custom);
  const [filters, setFilters] = useState<Filters>({});
  const [revision, setRevision] = useState(0);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const retryCard = useRef<(key: string) => void>(() => {});
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [dictionaryBusy, setDictionaryBusy] = useState(false);
  const [dictionaryError, setDictionaryError] = useState("");
  const [dictionaryRevision, setDictionaryRevision] = useState(0);
  const catalog = dictionary?.filters || [];
  const [filterOpen, setFilterOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>({}),
    [draftDepartments, setDraftDepartments] = useState<string[]>([]);
  const [field, setField] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Metric | null>(null);
  const query = parameters(departments);
  const dictionaryQuery = parameters(
    filterOpen ? draftDepartments : departments,
  );
  const filterJson = JSON.stringify(filters);
  const period = periods(preset, today, custom);
  const periodJson = JSON.stringify(period);
  const visibleKeys = metrics
    .filter((m) => !preferences.hidden.includes(m.key))
    .map((m) => m.key)
    .join(",");
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Preferences are optional. */
    }
  }, [storageKey, preferences]);
  useEffect(() => {
    const controller = new AbortController();
    setDictionaryBusy(true);
    setDictionaryError("");
    setDictionary(null);
    api<Dictionary>(`/indicators/filters?${dictionaryQuery}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setDictionary(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setDictionaryError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDictionaryBusy(false);
      });
    return () => controller.abort();
  }, [dictionaryQuery, dictionaryRevision]);
  useEffect(() => {
    const controller = new AbortController(),
      signal = controller.signal;
    setCards({});
    setDetail(null);
    const body = JSON.stringify({
      ...JSON.parse(periodJson),
      filters: JSON.parse(filterJson),
    });
    const inFlight = new Set<string>();
    async function load(key: string) {
      if (inFlight.has(key)) return;
      inFlight.add(key);
      setCards((c) => ({ ...c, [key]: {} }));
      try {
        const deadline = Date.now() + 15 * 60_000;
        while (!signal.aborted) {
          const result = await api<Report | Pending>(
            `/indicators/metric/${key}?${query}`,
            { method: "POST", body, signal },
          );
          if (signal.aborted) return;
          if (result.status === "ready") {
            setCards((c) => ({ ...c, [key]: { report: result } }));
            return;
          }
          if (Date.now() >= deadline)
            throw new Error("iiko долго формирует отчёт. Повторите загрузку.");
          await pause(
            Math.min(10, Math.max(1, result.retry_after)) * 1000,
            signal,
          );
        }
      } catch (e) {
        if (!signal.aborted)
          setCards((c) => ({
            ...c,
            [key]: {
              error:
                e instanceof Error
                  ? e.message
                  : "Не удалось загрузить показатель",
            },
          }));
      } finally {
        inFlight.delete(key);
      }
    }
    retryCard.current = (key) => {
      void load(key);
    };
    const queue = visibleKeys.split(",").filter(Boolean);
    async function worker() {
      while (queue.length && !signal.aborted) await load(queue.shift()!);
    }
    void worker();
    void worker();
    return () => {
      controller.abort();
      retryCard.current = () => {};
    };
  }, [periodJson, query, filterJson, visibleKeys, revision]);
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
  const ready = Object.values(cards).flatMap((c) =>
    c.report ? [c.report] : [],
  );
  const observed = ready
    .map((r) => r.observed_at)
    .sort()
    .at(-1);
  const detailReport = detail ? cards[detail.key]?.report : null;
  const options = field ? dictionary?.options[field] || [] : [];
  const optionBusy = dictionaryBusy;
  const optionError = dictionaryError;
  const syncTime = field ? dictionary?.sync[field]?.synced_at : undefined;
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
            disabled={!ready.length}
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
      <div className="indicators-periodbar">
        <Select
          aria-label="Период показателей"
          data={presets}
          value={preset}
          allowDeselect={false}
          size="sm"
          onChange={(value) => {
            if (value) {
              setDraftRange({ start: period.start, end: period.end });
              setCustom({ start: period.start, end: period.end });
              setPreset(value as Preset);
            }
          }}
        />
        <span>{rangeLabel(period.start, period.end)}</span>
      </div>
      {preset === "custom" && (
        <form
          className="indicators-range"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              draftRange.start &&
              draftRange.end &&
              draftRange.start <= draftRange.end
            )
              setCustom(draftRange);
          }}
        >
          <label>
            С
            <input
              aria-label="Начало периода"
              type="date"
              required
              min="2001-01-01"
              max={draftRange.end || today}
              value={draftRange.start}
              onChange={(e) =>
                setDraftRange((r) => ({ ...r, start: e.target.value }))
              }
            />
          </label>
          <label>
            По
            <input
              aria-label="Конец периода"
              type="date"
              required
              min={draftRange.start}
              max={today}
              value={draftRange.end}
              onChange={(e) =>
                setDraftRange((r) => ({ ...r, end: e.target.value }))
              }
            />
          </label>
          <Button
            size="xs"
            type="submit"
            disabled={
              !draftRange.start ||
              !draftRange.end ||
              draftRange.start > draftRange.end ||
              draftRange.end > today ||
              Date.parse(draftRange.end) - Date.parse(draftRange.start) >
                1826 * 86400000
            }
          >
            Показать
          </Button>
        </form>
      )}
      <div className="indicators-comparison">
        Сравнение: {rangeLabel(period.previous_start, period.previous_end)}
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
            }}
          >
            <IconX size={14} />
            Сбросить
          </button>
        </div>
      )}
      <div className="indicators-freshness">
        <span>
          iiko · кеш 5 мин
          {observed
            ? ` · ${new Date(observed).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Simferopol" })}`
            : ""}
        </span>
        {period.end === today && <span>Сегодня — на текущий момент</span>}
      </div>
      <div className="indicators-grid">
        {ordered
          .filter((m) => !preferences.hidden.includes(m.key))
          .map((metric) => {
            const card = cards[metric.key],
              report = card?.report;
            return (
              <article
                className="indicator-card"
                key={metric.key}
                data-metric={metric.key}
                aria-busy={!report && !card?.error}
              >
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <button
                      className="indicator-menu"
                      aria-label={`Настроить: ${metric.label}${metric.unit ? `, ${metric.unit}` : ""}`}
                    >
                      <IconDotsVertical size={15} />
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
                  onClick={() =>
                    card?.error
                      ? retryCard.current(metric.key)
                      : setDetail(metric)
                  }
                  disabled={!report && !card?.error}
                  aria-label={`${metric.label}${metric.unit ? `, ${metric.unit}` : ""}: ${card?.error ? "повторить загрузку" : "сравнить периоды"}`}
                >
                  <span className="indicator-label">
                    {metric.label}
                    {metric.unit ? `, ${metric.unit}` : ""}
                  </span>
                  {report ? (
                    <>
                      <strong className="indicator-current">
                        {display(report.current.value, {
                          ...metric,
                          unit: undefined,
                        })}
                      </strong>
                      <span className="indicator-previous">
                        {display(report.previous.value, {
                          ...metric,
                          unit: undefined,
                        })}
                      </span>
                    </>
                  ) : card?.error ? (
                    <span className="indicator-error">
                      <IconRefresh size={14} />
                      Повторить
                    </span>
                  ) : (
                    <span className="indicator-pending">
                      <Loader size={14} />
                      <span>Загрузка…</span>
                    </span>
                  )}
                </button>
                {card?.error && (
                  <span className="indicator-error-text" title={card.error}>
                    iiko пока не ответила
                  </span>
                )}
              </article>
            );
          })}
      </div>
      {preferences.hidden.length === metrics.length && (
        <Button variant="light" onClick={() => setSettingsOpen(true)}>
          Добавить показатели
        </Button>
      )}
      <div className="indicators-legend">
        <span>● Выбранный период</span>
        <span>● Период сравнения</span>
      </div>
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
                Загружаем справочник…
              </div>
            )}
            {optionError && field !== "restaurants" && (
              <Alert color="red">
                {optionError}
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => setDictionaryRevision((v) => v + 1)}
                >
                  Повторить
                </Button>
              </Alert>
            )}
            {syncTime && (
              <p className="indicators-dictionary-date">
                Обновлено {dateText(syncTime)}
              </p>
            )}
            {choiceList.filter((v) => match(v.label)).length > 150 && (
              <p className="muted">Первые 150 значений. Уточните поиск.</p>
            )}
            <div className="indicators-options">
              {choiceList
                .filter((v) => match(v.label))
                .slice(0, 150)
                .map((v) => (
                  <Checkbox
                    key={v.value}
                    label={v.label}
                    checked={selectedValues.includes(v.value)}
                    disabled={
                      field !== "restaurants" &&
                      selectedValues.length >= 100 &&
                      !selectedValues.includes(v.value)
                    }
                    onChange={() => toggle(v.value)}
                  />
                ))}
            </div>
            {!optionBusy &&
              !optionError &&
              !choiceList.filter((v) => match(v.label)).length && (
                <p className="muted">
                  {syncTime
                    ? "Нет подходящих значений в справочнике."
                    : "Справочник ещё синхронизируется."}
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
              hidden: [],
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
        {detail && detailReport && (
          <div className="indicator-detail">
            {[detailReport.current, detailReport.previous].map((p, i) => (
              <div key={i} className={i ? "previous" : "current"}>
                <span>
                  {rangeLabel(p.start, p.end)}
                  {p.partial ? " · день ещё идёт" : ""}
                </span>
                <strong>{display(p.value, detail)}</strong>
                <div className="indicator-bar-track">
                  <i
                    style={{
                      width: `${(Math.abs(Number(p.value || 0)) / Math.max(Math.abs(Number(detailReport.current.value || 0)), Math.abs(Number(detailReport.previous.value || 0)), 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </section>
  );
}

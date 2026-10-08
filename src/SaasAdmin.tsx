import { useEffect, useState } from "react";
import {
  IconBuilding,
  IconCreditCard,
  IconHistory,
  IconPlus,
  IconSearch,
  IconLogout,
  IconChevronRight,
  IconArrowLeft,
  IconExternalLink,
  IconEdit,
  IconArchive,
  IconRefresh,
} from "@tabler/icons-react";
import { api, ApiError, setCsrf } from "./saasAdminApi";
import {
  initials,
  integrationLabels,
  auditFieldLabel,
  companyCountLabel,
  moduleLabels,
  statusLabels,
  subscriptionLabels,
  type Company,
  type AuditEvent,
  type User,
} from "./saasAdminModel";
import SavedConnections from "./SaasAdminConnection";
import SaasAdminForm from "./SaasAdminForm";
import SaasAdminAccess from "./SaasAdminAccess";
const date = (s: string | null) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString(
        "ru-RU",
      )
    : "—";
const actions: Record<string, string> = {
  created: "Компания добавлена",
  updated: "Компания изменена",
  archived: "Компания архивирована",
  company_created: "Компания добавлена",
  company_updated: "Компания изменена",
  company_archived: "Компания архивирована",
  admin_access_created: "Доступ администратора создан",
  admin_access_reset: "Пароль администратора сброшен",
  connection_checked: "Проверка iiko",
};
function Badge({ company }: { company: Company }) {
  return (
    <span className={`sa-badge ${company.status}`}>
      <i />
      {statusLabels[company.status]}
    </span>
  );
}
export default function SaasAdmin() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<"companies" | "subscriptions" | "events">(
    "companies",
  );
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Company | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<"new" | Company | null>(null);
  const [formInitialTab, setFormInitialTab] = useState<0 | 1 | 2>(0);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventError, setEventError] = useState("");
  const [eventOffset, setEventOffset] = useState(0);
  const [eventTotal, setEventTotal] = useState(0);
  const [archive, setArchive] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    api
      .me()
      .then((data) => {
        if (live) {
          setUser(data.user);
          setCsrf(data.csrf_token);
        }
      })
      .catch((e) => {
        if (live && (!(e instanceof ApiError) || e.status !== 401))
          setLoginError(e.message);
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    setLoading(true);
    setError("");
    const timeout = setTimeout(() => {
      api
        .companies(q, status, offset)
        .then((data) => {
          if (live) {
            setCompanies(data.items);
            setTotal(data.total);
          }
        })
        .catch((e) => {
          if (live) {
            setError(e.message);
            if (e.status === 401) setUser(null);
          }
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [user, q, status, offset, refresh]);
  useEffect(() => {
    if (!user || !selected?.id) return;
    const id = selected.id;
    const controller = new AbortController();
    let live = true;
    api
      .company(id, controller.signal)
      .then((company) => {
        if (live)
          setSelected((current) =>
            current?.id === id && current.version <= company.version
              ? company
              : current,
          );
      })
      .catch((error) => {
        if (!live || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setSelected((current) => (current?.id === id ? null : current));
          setNotice(
            "Компания больше не доступна в реестре. Возможно, она архивирована.",
          );
          setArchive(false);
        } else {
          setError(error.message);
          if (error instanceof ApiError && error.status === 401) setUser(null);
        }
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [user, selected?.id, refresh]);
  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    let live = true;
    setEventsLoading(true);
    setEventError("");
    api
      .events(selected.id, eventOffset)
      .then((data) => {
        if (live) {
          setEvents(data.items);
          setEventTotal(data.total);
        }
      })
      .catch((e) => {
        if (live) setEventError(e.message);
      })
      .finally(() => {
        if (live) setEventsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [selected?.id, selected?.version, eventOffset, refresh]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const data = await api.login(username, password);
      setUser(data.user);
      setCsrf(data.csrf_token);
      setPassword("");
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoginBusy(false);
    }
  }
  async function logout() {
    try {
      await api.logout();
      setUser(null);
      setCsrf("");
      setCompanies([]);
      setSelected(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function select(c: Company) {
    setSelected(c);
    setEventOffset(0);
  }
  async function archiveCompany() {
    if (!selected || archiveBusy) return;
    setArchiveBusy(true);
    setError("");
    try {
      await api.archive(selected);
      setArchive(false);
      setSelected(null);
      setRefresh((n) => n + 1);
      setNotice("Компания архивирована. История сохранена.");
    } catch (err) {
      setError((err as Error).message);
      setArchive(false);
    } finally {
      setArchiveBusy(false);
    }
  }
  const history = (
    <>
      {eventError && (
        <div className="sa-error" role="alert">
          {eventError}
          <button onClick={() => setRefresh((n) => n + 1)}>Повторить</button>
        </div>
      )}
      {eventsLoading ? (
        <p className="sa-hint" role="status">
          Загружаем историю…
        </p>
      ) : events.length ? (
        <div className="sa-events">
          {events.map((event) => (
            <article key={event.id}>
              <div className="sa-event-dot" />
              <div>
                <strong>{actions[event.action] || event.action}</strong>
                <p>
                  {event.actor.display_name} · {date(event.created_at)}{" "}
                  {new Date(event.created_at).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {event.changed_fields.length > 0 && (
                  <span className="sa-hint">
                    Поля:{" "}
                    {Array.from(
                      new Set(event.changed_fields.map(auditFieldLabel)),
                    ).join(", ")}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        !eventError && <p className="sa-hint">Событий пока нет</p>
      )}
      {eventTotal > 50 && (
        <div className="sa-pagination">
          <button
            disabled={!eventOffset}
            onClick={() => setEventOffset((n) => Math.max(0, n - 50))}
          >
            Назад
          </button>
          <span>
            {eventOffset + 1}–{Math.min(eventOffset + 50, eventTotal)}
          </span>
          <button
            disabled={eventOffset + 50 >= eventTotal}
            onClick={() => setEventOffset((n) => n + 50)}
          >
            Далее
          </button>
        </div>
      )}
    </>
  );
  if (checking)
    return (
      <div className="sa-auth">
        <div role="status">Загрузка RestControl…</div>
      </div>
    );
  if (!user)
    return (
      <main className="sa-auth">
        <div className="sa-login">
          <Brand />
          <span className="sa-eyebrow">ПАНЕЛЬ УПРАВЛЕНИЯ</span>
          <h1>Добро пожаловать</h1>
          <p className="sa-hint">Войдите в управление компаниями сервиса</p>
          <form onSubmit={login}>
            {loginError && (
              <div className="sa-error" role="alert">
                {loginError}
              </div>
            )}
            <label className="sa-field">
              Логин
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="sa-field">
              Пароль
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={loginBusy} className="sa-button">
              {loginBusy ? "Входим…" : "Войти"}
            </button>
          </form>
        </div>
      </main>
    );
  return (
    <div className="sa-shell sa-app">
      <aside className="sa-sidebar">
        <Brand />
        <nav aria-label="Разделы сервиса">
          {(
            [
              ["companies", "Компании", IconBuilding],
              ["subscriptions", "Подписки", IconCreditCard],
              ["events", "История компании", IconHistory],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? "selected" : ""}
              onClick={() => setView(key)}
            >
              <Icon size={22} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sa-user">
          <div className="sa-avatar">
            {initials(user.display_name || user.username)}
          </div>
          <div>
            <strong>{user.display_name || user.username}</strong>
            <span>Администратор сервиса</span>
          </div>
          <button title="Выйти" aria-label="Выйти" onClick={logout}>
            <IconLogout size={20} />
          </button>
        </div>
      </aside>
      <main className="sa-main">
        <div className="sa-breadcrumb">
          Сервис <span>/</span>{" "}
          {view === "companies"
            ? "Компании"
            : view === "subscriptions"
              ? "Подписки"
              : "История компании"}
        </div>
        <header className="sa-page-header">
          <div>
            <h1>
              {view === "companies"
                ? "Компании"
                : view === "subscriptions"
                  ? "Подписки"
                  : "История компании"}
            </h1>
            <p>Управление реестром RestControl</p>
          </div>
          <button className="sa-button" onClick={() => setForm("new")}>
            <IconPlus size={20} />
            Добавить компанию
          </button>
        </header>
        {notice && (
          <div className="sa-notice" role="status">
            {notice}
            <button
              aria-label="Скрыть уведомление"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="sa-error" role="alert">
            {error}
            <button onClick={() => setRefresh((n) => n + 1)}>Повторить</button>
          </div>
        )}
        {view === "events" ? (
          <section className="sa-card sa-history-page">
            <h2>{selected ? selected.name : "Выберите компанию"}</h2>
            {selected ? (
              history
            ) : (
              <p className="sa-hint">
                Откройте компанию в реестре, чтобы посмотреть её историю
                изменений.
              </p>
            )}
            <button
              className="sa-button secondary"
              onClick={() => setView("companies")}
            >
              <IconArrowLeft size={16} />К компаниям
            </button>
          </section>
        ) : (
          <>
            <section className="sa-stats" aria-label="Показатели реестра">
              <div>
                <strong>{total}</strong>
                <span>
                  {q || status ? "По текущему фильтру" : "Компаний в реестре"}
                </span>
              </div>
              <div>
                <strong>
                  {companies.reduce((n, c) => n + c.rms.length, 0)}
                </strong>
                <span>RMS на этой странице</span>
              </div>
              <div>
                <strong className="sa-attention">
                  {
                    companies.filter((c) => c.subscription_state === "expired")
                      .length
                  }
                </strong>
                <span>Истекших подписок на странице</span>
              </div>
            </section>
            <div className="sa-filters">
              <label className="sa-search">
                <IconSearch size={21} />
                <input
                  aria-label="Поиск компании или домена"
                  placeholder="Поиск компании или домена"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setOffset(0);
                  }}
                />
              </label>
              <select
                aria-label="Статус регистрации"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Все статусы</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className="sa-icon-button"
                aria-label="Обновить реестр"
                onClick={() => setRefresh((n) => n + 1)}
              >
                <IconRefresh size={20} />
              </button>
            </div>
            <section
              className="sa-table-card"
              aria-label="Реестр компаний"
              aria-busy={loading}
            >
              <div className="sa-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Компания</th>
                      {view === "companies" ? (
                        <>
                          <th>RMS</th>
                          <th>Регистрация</th>
                          <th>iiko</th>
                        </>
                      ) : (
                        <>
                          <th>План</th>
                          <th>Период</th>
                          <th>Состояние</th>
                        </>
                      )}
                      <th>{view === "companies" ? "Подписка" : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr
                        key={c.id}
                        className={selected?.id === c.id ? "selected" : ""}
                      >
                        <td>
                          <button
                            className="sa-company-button"
                            onClick={() => select(c)}
                          >
                            <span className="sa-avatar">
                              {initials(c.name)}
                            </span>
                            <span>
                              <strong>{c.name}</strong>
                              <small>{c.domain || c.slug}</small>
                            </span>
                          </button>
                        </td>
                        {view === "companies" ? (
                          <>
                            <td>{c.rms.length}</td>
                            <td>
                              <Badge company={c} />
                            </td>
                            <td>
                              <span
                                className={`sa-integration ${c.integration_state}`}
                              >
                                {integrationLabels[c.integration_state]}
                              </span>
                            </td>
                            <td>
                              {subscriptionLabels[c.subscription_state]}
                              <button
                                aria-label={`Открыть ${c.name}`}
                                className="sa-row-open"
                                onClick={() => select(c)}
                              >
                                <IconChevronRight size={18} />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{c.subscription.plan || "Не задан"}</td>
                            <td>
                              {date(c.subscription.start_date)} —{" "}
                              {date(c.subscription.end_date)}
                            </td>
                            <td>{subscriptionLabels[c.subscription_state]}</td>
                            <td>
                              <button
                                aria-label={`Изменить подписку ${c.name}`}
                                className="sa-row-open"
                                onClick={() => setForm(c)}
                              >
                                <IconEdit size={18} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!companies.length && (
                <div className="sa-empty">
                  <IconBuilding size={36} />
                  <h2>
                    {loading
                      ? "Загружаем компании…"
                      : q || status
                        ? "Ничего не найдено"
                        : "Начните с первой компании"}
                  </h2>
                  <p>
                    {loading
                      ? ""
                      : q || status
                        ? "Попробуйте изменить поиск или статус."
                        : "Добавьте организацию, подключения iiko и параметры подписки."}
                  </p>
                  {!loading && !q && !status && (
                    <button
                      className="sa-button"
                      onClick={() => setForm("new")}
                    >
                      <IconPlus size={18} />
                      Добавить компанию
                    </button>
                  )}
                </div>
              )}
              <footer className="sa-table-footer">
                <span>
                  {companyCountLabel(total)}
                  {loading ? " · Обновление…" : ""}
                </span>
                <div>
                  <button
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset((n) => Math.max(0, n - 50))}
                    aria-label="Предыдущая страница"
                  >
                    ‹
                  </button>
                  <span>{Math.floor(offset / 50) + 1}</span>
                  <button
                    disabled={offset + 50 >= total || loading}
                    onClick={() => setOffset((n) => n + 50)}
                    aria-label="Следующая страница"
                  >
                    ›
                  </button>
                </div>
              </footer>
            </section>
            <p className="sa-footnote">
              Статус регистрации задаётся вручную. Проверка соединений доступна
              в карточке компании.
            </p>
          </>
        )}
      </main>
      <aside className="sa-inspector" aria-label="Карточка компании">
        {selected ? (
          <>
            <header>
              <span className="sa-avatar large">{initials(selected.name)}</span>
              <div>
                <h2>{selected.name}</h2>
                <Badge company={selected} />
              </div>
              <button
                className="sa-icon-button"
                aria-label="Изменить компанию"
                onClick={() => setForm(selected)}
              >
                <IconEdit size={20} />
              </button>
            </header>
            <section>
              <h3>Контакт администратора</h3>
              {selected.primary_admin ? (
                <>
                  <strong>
                    {selected.primary_admin.name || "Имя не указано"}
                  </strong>
                  <p>{selected.primary_admin.email || "Email не указан"}</p>
                  {selected.primary_admin.phone && (
                    <p>{selected.primary_admin.phone}</p>
                  )}
                </>
              ) : (
                <p className="sa-muted">Не задан</p>
              )}
            </section>
            <SaasAdminAccess
              key={selected.id}
              company={selected}
              onCompany={(snapshot) => {
                setSelected((current) =>
                  current?.id === snapshot.id &&
                  snapshot.version >= current.version
                    ? snapshot
                    : current,
                );
                setRefresh((n) => n + 1);
              }}
              onVersion={(version) => {
                setSelected((current) =>
                  current?.id === selected.id && version >= current.version
                    ? { ...current, version }
                    : current,
                );
                setRefresh((n) => n + 1);
              }}
            />
            <section>
              <div className="sa-section-heading">
                <h3>Подключения</h3>
                <span
                  className={`sa-integration ${selected.integration_state}`}
                >
                  {integrationLabels[selected.integration_state]}
                </span>
              </div>
              <h4>Домен</h4>
              <p>{selected.domain || "Не задан"}</p>
              <SavedConnections
                company={selected}
                onVersion={(version) => {
                  setSelected((current) =>
                    current?.id === selected.id && version >= current.version
                      ? { ...current, version }
                      : current,
                  );
                  setRefresh((current) => current + 1);
                }}
                onRefresh={() => setRefresh((current) => current + 1)}
                onEdit={() => {
                  setFormInitialTab(1);
                  setForm(selected);
                }}
              />
            </section>
            <section>
              <h3>Модули</h3>
              <div className="sa-module-tags">
                {Object.entries(selected.modules)
                  .filter(([, enabled]) => enabled)
                  .map(([key]) => (
                    <span key={key}>
                      {moduleLabels[key as keyof Company["modules"]]}
                    </span>
                  ))}
                {!Object.values(selected.modules).some(Boolean) && (
                  <span className="sa-muted">Не выбраны</span>
                )}
              </div>
            </section>
            <section>
              <div className="sa-section-heading">
                <h3>Подписка</h3>
                <button
                  className="sa-text-button"
                  onClick={() => setForm(selected)}
                >
                  Изменить
                </button>
              </div>
              <strong>{selected.subscription.plan || "План не задан"}</strong>
              <p>
                {subscriptionLabels[selected.subscription_state]}
                {selected.subscription.end_date &&
                  ` · до ${date(selected.subscription.end_date)}`}
              </p>
            </section>
            {selected.notes && (
              <section>
                <h3>Заметки</h3>
                <p className="sa-notes">{selected.notes}</p>
              </section>
            )}
            <section>
              <div className="sa-section-heading">
                <h3>Последние изменения</h3>
                <button
                  className="sa-text-button"
                  onClick={() => setView("events")}
                >
                  Все
                </button>
              </div>
              {history}
            </section>
            <div className="sa-inspector-actions">
              {selected.domain && (
                <a
                  className="sa-button secondary"
                  href={`https://${selected.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconExternalLink size={18} />
                  Открыть сайт
                </a>
              )}
              <button
                className="sa-button secondary danger"
                onClick={() => setArchive(true)}
              >
                <IconArchive size={18} />
                Архивировать компанию
              </button>
            </div>
          </>
        ) : (
          <div className="sa-inspector-empty">
            <IconBuilding size={38} />
            <h2>Карточка компании</h2>
            <p>
              Выберите компанию в списке, чтобы увидеть подключения, модули и
              историю.
            </p>
          </div>
        )}
      </aside>
      {form && (
        <SaasAdminForm
          company={form === "new" ? undefined : form}
          initialTab={formInitialTab}
          onClose={() => {
            setForm(null);
            setFormInitialTab(0);
          }}
          onSaved={(c) => {
            setForm(null);
            setFormInitialTab(0);
            select(c);
            setQ("");
            setStatus("");
            setOffset(0);
            setRefresh((n) => n + 1);
            setNotice("Данные компании сохранены.");
          }}
        />
      )}
      {archive && selected && (
        <div className="sa-overlay">
          <div
            className="sa-dialog sa-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sa-archive-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !archiveBusy) setArchive(false);
              if (e.key === "Tab") {
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                );
                if (e.shiftKey && document.activeElement === buttons[0]) {
                  e.preventDefault();
                  buttons.at(-1)?.focus();
                } else if (
                  !e.shiftKey &&
                  document.activeElement === buttons.at(-1)
                ) {
                  e.preventDefault();
                  buttons[0]?.focus();
                }
              }
            }}
          >
            <h2 id="sa-archive-title">Архивировать «{selected.name}»?</h2>
            <p>
              Компания исчезнет из рабочего реестра. Данные и история изменений
              сохранятся.
            </p>
            <div>
              <button
                autoFocus
                disabled={archiveBusy}
                className="sa-button secondary"
                onClick={() => setArchive(false)}
              >
                Отмена
              </button>
              <button
                disabled={archiveBusy}
                className="sa-button danger-filled"
                onClick={archiveCompany}
              >
                {archiveBusy ? "Архивация…" : "Архивировать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="sa-brand">
      <span className="sa-brand-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      <div>
        <strong>RestControl</strong>
        <span>Управление сервисом</span>
      </div>
    </div>
  );
}

import {
  useEffect,
  useState,
  createContext,
  useContext,
  useRef,
  type FormEvent,
  Fragment,
} from "react";
import {
  Routes,
  Route,
  NavLink,
  useLocation,
  Link,
  Navigate,
} from "react-router-dom";
import {
  Button,
  TextInput,
  PasswordInput,
  Alert,
  Loader,
  Badge,
  Avatar,
} from "@mantine/core";
import {
  IconChartBar,
  IconLayoutDashboard,
  IconReceipt,
  IconArrowsExchange,
  IconTrash,
  IconPackages,
  IconChefHat,
  IconBuildingWarehouse,
  IconUsers,
  IconRoute,
  IconActivity,
  IconLogout,
  IconMenu2,
  IconChevronRight,
  IconArrowUpRight,
  IconBuildingStore,
  IconShieldCheck,
  IconUserCircle,
} from "@tabler/icons-react";
import {
  announcePasswordRequired,
  api,
  clearPasswordRequirement,
  getPasswordRequirementVersion,
  renewSession,
  type Meta,
} from "./api";
import {
  SalesPage,
  ResourcePage,
  DetailPage,
  StatusPage,
  TopologyPage,
} from "./pages";
import { BalancesPage } from "./BalancesPage";
import { Overview } from "./Overview";
import { PurchasePrices } from "./PurchasePrices";
import { AssistantProvider } from "./AssistantContext";
import { AssistantLayout, AssistantToggle } from "./AssistantRail";
import { RestaurantPicker } from "./RestaurantPicker";
import { Indicators } from "./Indicators";
import { DepositsPage } from "./DepositsPage";
import { ManagementPage } from "./ManagementPage";
import { DocumentDataProvider } from "./DocumentData";
import { DocumentsPage } from "./DocumentsPage";
import { ProfilePage } from "./ProfilePage";
import { PasswordForm } from "./PasswordForm";
import { ForgotPassword, ResetPassword } from "./PasswordRecovery";
import { checkForegroundPasswordRequirement } from "./foregroundPasswordCheck";
import "./profile.css";
import { CommercialInvoices } from "./CommercialInvoices";
export const sections = [
  { path: "/", title: "Обзор", icon: IconLayoutDashboard },
  { path: "/indicators", title: "Показатели", icon: IconActivity },
  { path: "/sales", title: "Продажи", icon: IconChartBar },
  { path: "/deposits", title: "Депозиты", icon: IconReceipt },
  { path: "/cash-shifts", title: "Кассовые смены", icon: IconReceipt },
  { path: "/invoices", title: "Приходные накладные", icon: IconReceipt },
  { path: "/purchase-prices", title: "Закупочные цены", icon: IconChartBar },
  { path: "/outgoing", title: "Реализация", icon: IconArrowUpRight },
  { path: "/transfers", title: "Перемещения", icon: IconArrowsExchange },
  { path: "/writeoffs", title: "Списания", icon: IconTrash },
  { path: "/products", title: "Номенклатура", icon: IconPackages },
  { path: "/charts", title: "Технологические карты", icon: IconChefHat },
  {
    path: "/balances",
    title: "Остатки на складах",
    icon: IconBuildingWarehouse,
  },
  { path: "/employees", title: "Сотрудники iiko", icon: IconUsers },
  { path: "/events", title: "События заказов", icon: IconRoute },
  { path: "/status", title: "Статус данных", icon: IconActivity },
  { path: "/management", title: "Управление", icon: IconShieldCheck },
];
type Workspace = {
  meta: Meta;
  departments: string[];
  setDepartment: (v: string) => void;
  setDepartments: (ids: string[]) => void;
  start: string;
  end: string;
  setPeriod: (start: string, end: string) => void;
  query: (dates?: boolean) => string;
};
const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace is missing");
  return value;
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      <div>
        Chaika<span>TEAM / ANALYTICS</span>
      </div>
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-art">
        <Brand />
        <div>
          <span className="eyebrow">ВАШИ РЕСТОРАНЫ. ОДНА КАРТИНА.</span>
          <h1>
            Данные, за которыми
            <br />
            виден бизнес.
          </h1>
          <p>
            Продажи, документы и история действий —<br />в одном рабочем
            пространстве.
          </p>
          <div className="art-chart">
            {[26, 39, 34, 58, 45, 65, 57, 80, 71, 95, 86, 100].map((v, i) => (
              <i key={i} style={{ height: v + "%" }} />
            ))}
          </div>
        </div>
        <span className="muted">Chaika Team · Рабочее пространство</span>
      </div>
      <div className="login-panel">
        <form onSubmit={submit}>
          <span className="login-symbol">
            <IconShieldCheck size={27} />
          </span>
          <h2>С возвращением</h2>
          <p className="muted">
            Войдите, чтобы открыть данные ваших ресторанов.
          </p>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <TextInput
            label="Логин или телефон"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="gastrodvor или +7 978 123-45-67"
            description="@chaika.team подставим автоматически"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoComplete="username"
          />
          <PasswordInput
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
            autoComplete="current-password"
          />
          <Button type="submit" fullWidth loading={busy} size="md">
            Войти в рабочее пространство
          </Button>
          <Button
            component={Link}
            to="/forgot-password"
            variant="subtle"
            fullWidth
          >
            Забыли пароль?
          </Button>
          <p className="login-note">
            Доступ к ресторанам назначает владелец системы.
          </p>
        </form>
      </div>
    </main>
  );
}
export default function App() {
  const location = useLocation();
  if (location.pathname === "/forgot-password") return <ForgotPassword />;
  if (location.pathname === "/reset-password") return <ResetPassword />;
  return <WorkspaceApp />;
}

function WorkspaceApp() {
  const [meta, setMeta] = useState<Meta | null>(null),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [passwordRequired, setPasswordRequired] = useState(false);
  const passwordRequiredRef = useRef(false);
  const requestEpoch = useRef(0);
  const currentUserId = useRef<string | null>(null);
  currentUserId.current = meta?.user.id ?? null;
  const [departments, setDepartments] = useState<string[]>([]);
  const setDepartment = (id: string) => setDepartments(id ? [id] : []);
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(() => {
    let live = true;
    const requirementVersion = getPasswordRequirementVersion();
    const epoch = requestEpoch.current;
    setChecking(true);
    api<Meta>("/me")
      .then((x) => {
        if (live && epoch === requestEpoch.current) {
          if (requirementVersion !== getPasswordRequirementVersion()) {
            setRevision((value) => value + 1);
            return;
          }
          if (x.user.password_change_required) {
            if (!passwordRequiredRef.current) announcePasswordRequired();
            passwordRequiredRef.current = true;
            setPasswordRequired(true);
            setMeta(null);
            setDepartments([]);
            return;
          }
          passwordRequiredRef.current = false;
          clearPasswordRequirement();
          setPasswordRequired(false);
          setMeta(x);
          const date =
            (x.live_sales_enabled ? x.today : x.sales_dates[0]) ??
            new Date().toISOString().slice(0, 10);
          setStart((v) => v || date);
          setEnd((v) => v || date);
          setError("");
        }
      })
      .catch((e) => {
        if (live && epoch === requestEpoch.current) {
          if (requirementVersion !== getPasswordRequirementVersion()) {
            setRevision((value) => value + 1);
            return;
          }
          setMeta(null);
          if (e.status !== 401) setError(e.message);
        }
      })
      .finally(() => {
        if (
          live &&
          epoch === requestEpoch.current &&
          requirementVersion === getPasswordRequirementVersion()
        )
          setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    const lost = () => {
      requestEpoch.current += 1;
      passwordRequiredRef.current = false;
      clearPasswordRequirement();
      setPasswordRequired(false);
      setMeta(null);
      setDepartments([]);
      setChecking(false);
    };
    const required = () => {
      requestEpoch.current += 1;
      passwordRequiredRef.current = true;
      setPasswordRequired(true);
      setMeta(null);
      setDepartments([]);
      setRevision((value) => value + 1);
    };
    const updated = () => setRevision((value) => value + 1);
    window.addEventListener("session-lost", lost);
    window.addEventListener("password-required", required);
    window.addEventListener("password-updated", updated);
    return () => {
      window.removeEventListener("session-lost", lost);
      window.removeEventListener("password-required", required);
      window.removeEventListener("password-updated", updated);
    };
  }, []);
  useEffect(() => {
    if (!meta?.user.id) return;
    let lastAttempt = 0;
    const renew = () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastAttempt < 20 * 60_000
      )
        return;
      lastAttempt = Date.now();
      void renewSession().catch(() => {
        // A temporary outage keeps the current session; the next API request retries.
      });
    };
    renew();
    const timer = window.setInterval(renew, 60_000);
    window.addEventListener("focus", renew);
    document.addEventListener("visibilitychange", renew);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", renew);
      document.removeEventListener("visibilitychange", renew);
    };
  }, [meta?.user.id]);
  useEffect(() => {
    if (!meta?.user.id || passwordRequired) return;
    const accountId = meta.user.id;
    let live = true;
    let lastCheck = Date.now();
    const pending = new Set<AbortController>();
    const check = () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastCheck < 30_000
      )
        return;
      lastCheck = Date.now();
      const controller = new AbortController();
      const epoch = requestEpoch.current;
      const requirementVersion = getPasswordRequirementVersion();
      pending.add(controller);
      void checkForegroundPasswordRequirement(
        (signal) => api<Meta>("/me", { signal }),
        (userId) =>
          live &&
          epoch === requestEpoch.current &&
          requirementVersion === getPasswordRequirementVersion() &&
          currentUserId.current === accountId &&
          userId === accountId,
        controller.signal,
        announcePasswordRequired,
      )
        .catch(() => {
          // The existing session and the next foreground check remain available.
        })
        .finally(() => pending.delete(controller));
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      for (const controller of pending) controller.abort();
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [meta?.user.id, passwordRequired]);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  async function logout() {
    requestEpoch.current += 1;
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
    }
    passwordRequiredRef.current = false;
    clearPasswordRequirement();
    setPasswordRequired(false);
    setMeta(null);
    setDepartments([]);
    setChecking(false);
  }
  async function verifyPasswordChange() {
    const version = getPasswordRequirementVersion();
    const epoch = requestEpoch.current;
    const updated = await api<Meta>("/me");
    if (
      epoch !== requestEpoch.current ||
      version !== getPasswordRequirementVersion() ||
      updated.user.password_change_required
    )
      throw new Error("Смена пароля ещё не подтверждена. Повторите проверку.");
    passwordRequiredRef.current = false;
    clearPasswordRequirement();
    setPasswordRequired(false);
    setMeta(updated);
    setError("");
  }
  if (passwordRequired)
    return (
      <main className="password-gate">
        <div className="password-gate-card">
          <Brand />
          <h1>Задайте новый пароль</h1>
          <p>Смените временный пароль, чтобы продолжить работу.</p>
          <PasswordForm required onSuccess={verifyPasswordChange} />
          <Button component={Link} to="/forgot-password" variant="subtle">
            Не помню текущий пароль
          </Button>
          <Button variant="subtle" onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </main>
    );
  if (checking)
    return (
      <div className="center-screen">
        <Loader />
        <span>Открываем рабочее пространство…</span>
      </div>
    );
  if (!meta)
    return (
      <>
        {error && (
          <Alert color="red">
            {error}
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setRevision((x) => x + 1)}
            >
              Повторить
            </Button>
          </Alert>
        )}
        <Login onLogin={() => setRevision((x) => x + 1)} />
      </>
    );
  const assigned =
    meta.sections ??
    (meta.user.role === "deposits"
      ? ["deposits"]
      : sections.map((s) => s.path.slice(1) || "overview"));
  const allowed = assigned.filter(
    (section) =>
      !meta.warehouse_capabilities?.unsupported_sections.includes(section),
  );
  const availableSections = sections.filter((s) =>
    s.path === "/management"
      ? meta.can_manage
      : allowed.includes(s.path.slice(1) || "overview"),
  );
  const currentSection =
    location.pathname === "/" ? "overview" : location.pathname.split("/")[1];
  const currentAllowed =
    currentSection === "profile"
      ? true
      : currentSection === "management"
        ? meta.can_manage
        : allowed.includes(currentSection);
  if (!currentAllowed && availableSections.length)
    return <Navigate to={availableSections[0].path} replace />;
  const canAssistant =
    allowed.includes("purchase-prices") &&
    !["deposits", "management", "profile"].includes(currentSection);
  const ContentLayout = canAssistant ? AssistantLayout : Fragment;
  const title =
    currentSection === "profile"
      ? "Мой профиль"
      : (sections.find(
          (s) => s.path !== "/" && location.pathname.startsWith(s.path),
        )?.title ?? "Обзор");
  const commercialWorkspace =
    ["/invoices", "/outgoing"].includes(location.pathname) &&
    new URLSearchParams(location.search).get("view") !== "analytics";
  const datesEnabled = [
    "/",
    "/sales",
    "/cash-shifts",
    "/invoices",
    "/outgoing",
    "/transfers",
    "/writeoffs",
    "/events",
  ].includes(location.pathname);
  const query = (dates = false) => {
    const p = new URLSearchParams();
    for (const id of departments) p.append("department_id", id);
    if (dates) {
      p.set("start", start);
      p.set("end", end);
    }
    return p.toString();
  };
  return (
    <WorkspaceContext.Provider
      value={{
        meta,
        departments,
        setDepartment,
        setDepartments,
        start,
        end,
        query,
        setPeriod: (from, to) => {
          setStart(from);
          setEnd(to);
        },
      }}
    >
      <DocumentDataProvider key={meta.user.id}>
        <AssistantProvider key={meta.user.id}>
          <div
            className={
              "app-shell" +
              (location.pathname === "/" ? " is-overview" : "") +
              (location.pathname === "/indicators" ? " is-indicators" : "")
            }
          >
            {mobile && (
              <button
                className="sidebar-overlay"
                aria-label="Закрыть меню"
                onClick={() => setMobile(false)}
              />
            )}
            <aside className={"sidebar " + (mobile ? "is-open" : "")}>
              <Link to="/" className="brand-link">
                <Brand />
              </Link>
              <div className="workspace-label">
                <IconBuildingStore size={16} /> Рестораны Chaika
              </div>
              <span className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</span>
              <nav>
                {availableSections.map((s) => (
                  <NavLink
                    key={s.path}
                    to={s.path}
                    end={s.path === "/"}
                    className={({ isActive }) =>
                      (isActive ? "active " : "") +
                      (s.path === "/employees" ? "nav-bottom" : "")
                    }
                  >
                    <s.icon size={18} stroke={1.6} />
                    <span>{s.title}</span>
                    {s.path === "/" && <IconChevronRight size={13} />}
                  </NavLink>
                ))}
              </nav>
              <div className="sidebar-footer">
                <NavLink to="/profile" className="profile-nav-link">
                  <IconUserCircle size={18} stroke={1.6} />
                  <span>Мой профиль</span>
                </NavLink>
                <div className="connection">
                  <i /> Данные из Supabase
                </div>
                <div className="user-card">
                  <Link
                    to="/profile"
                    className="user-card-profile"
                    aria-label="Открыть мой профиль"
                  >
                    <Avatar color="cyan" radius="md">
                      {meta.user.display_name[0]}
                    </Avatar>
                    <span>
                      <strong>{meta.user.display_name}</strong>
                      <small>
                        {meta.user.role === "owner"
                          ? "Владелец"
                          : meta.user.role === "manager"
                            ? "Менеджер"
                            : meta.user.role === "deposits"
                              ? "Депозиты"
                              : "Пользователь"}
                      </small>
                    </span>
                  </Link>
                  <button onClick={logout} title="Выйти" aria-label="Выйти">
                    <IconLogout size={18} />
                  </button>
                </div>
              </div>
            </aside>
            <div className="main-area">
              <header className="topbar">
                <button
                  className="mobile-menu"
                  onClick={() => setMobile(true)}
                  aria-label="Открыть меню"
                >
                  <IconMenu2 />
                </button>
                <div className="breadcrumb">
                  Рабочее пространство <IconChevronRight size={14} />
                  <strong>{title}</strong>
                </div>
                <div className="topbar-actions">
                  {canAssistant && <AssistantToggle />}
                  <Badge variant="light" color="cyan">
                    Первая версия
                  </Badge>
                </div>
              </header>
              {currentAllowed &&
                !commercialWorkspace &&
                !(
                  meta.documents_enabled &&
                  ["transfers", "writeoffs"].includes(currentSection) &&
                  (location.pathname.includes("/documents/") ||
                    new URLSearchParams(location.search).get("view") !==
                      "analytics")
                ) &&
                !["deposits", "management", "profile"].includes(
                  currentSection,
                ) && (
                  <div className="filterbar">
                    {location.pathname === "/" && (
                      <button
                        className="mobile-menu overview-menu"
                        onClick={() => setMobile(true)}
                        aria-label="Открыть меню"
                      >
                        <IconMenu2 />
                      </button>
                    )}
                    {location.pathname === "/purchase-prices" ? (
                      <span className="muted">
                        Закупочные цены по сети · все доступные заведения
                      </span>
                    ) : (
                      <RestaurantPicker
                        restaurants={meta.departments}
                        value={departments}
                        onChange={setDepartments}
                      />
                    )}
                    {location.pathname !== "/purchase-prices" && (
                      <>
                        <div className="date-filter">
                          <label htmlFor="date-start">Период</label>
                          <input
                            id="date-start"
                            aria-label="Начало периода"
                            type="date"
                            disabled={!datesEnabled}
                            value={start}
                            onChange={(e) => setStart(e.currentTarget.value)}
                            onInput={(e) => setStart(e.currentTarget.value)}
                          />
                          <span>—</span>
                          <input
                            aria-label="Конец периода"
                            type="date"
                            disabled={!datesEnabled}
                            min={start}
                            value={end}
                            onChange={(e) => setEnd(e.currentTarget.value)}
                            onInput={(e) => setEnd(e.currentTarget.value)}
                          />
                        </div>
                        <button
                          className="reset-date"
                          onClick={() => {
                            const d = meta.sales_dates[0];
                            if (d) {
                              setStart(d);
                              setEnd(d);
                            }
                          }}
                        >
                          Последний день OLAP
                        </button>
                        {meta.live_sales_enabled &&
                          (location.pathname === "/" ||
                            location.pathname === "/sales") && (
                            <button
                              className="reset-date"
                              onClick={() => {
                                if (meta.today) {
                                  setStart(meta.today);
                                  setEnd(meta.today);
                                }
                              }}
                            >
                              Сегодня · iiko
                            </button>
                          )}
                      </>
                    )}
                    {location.pathname === "/" && <div id="overview-toolbar" />}
                  </div>
                )}
              <ContentLayout>
                <main className="content">
                  {!availableSections.length && currentSection !== "profile" ? (
                    <Alert>
                      Доступ к разделам пока не назначен. Обратитесь к
                      администратору.
                    </Alert>
                  ) : (
                    <Routes>
                      <Route
                        path="/profile"
                        element={
                          <ProfilePage key={meta.user.id} user={meta.user} />
                        }
                      />
                      <Route
                        path="/"
                        element={<Overview key={departments.join(",")} />}
                      />
                      <Route
                        path="/management"
                        element={
                          <ManagementPage
                            documentsEnabled={meta.documents_enabled}
                            onChange={() => {
                              api<Meta>("/me")
                                .then(setMeta)
                                .catch((e) => setError(e.message));
                            }}
                          />
                        }
                      />
                      <Route path="/sales" element={<SalesPage />} />
                      <Route
                        path="/deposits"
                        element={<DepositsPage key={meta.user.id} />}
                      />
                      <Route
                        path="/indicators"
                        element={<Indicators key={meta.user.id} />}
                      />
                      <Route
                        path="/purchase-prices"
                        element={<PurchasePrices />}
                      />
                      <Route path="/balances" element={<BalancesPage />} />
                      <Route path="/status" element={<StatusPage />} />
                      <Route
                        path="/events/topology"
                        element={<TopologyPage />}
                      />
                      {meta.documents_enabled &&
                        ["transfers", "writeoffs"].map((resource) => (
                          <Route
                            key={resource}
                            path={`/${resource}/*`}
                            element={
                              <DocumentsPage
                                key={resource}
                                kind={
                                  resource === "transfers"
                                    ? "waybill"
                                    : "writeoff"
                                }
                              />
                            }
                          />
                        ))}
                      {sections
                        .filter(
                          (s) =>
                            !(
                              meta.documents_enabled &&
                              ["/transfers", "/writeoffs"].includes(s.path)
                            ) &&
                            ![
                              "/",
                              "/sales",
                              "/deposits",
                              "/management",
                              "/indicators",
                              "/status",
                              "/balances",
                              "/purchase-prices",
                            ].includes(s.path),
                        )
                        .map((s) => (
                          <Route
                            key={s.path}
                            path={s.path}
                            element={
                              s.path === "/invoices" ||
                              s.path === "/outgoing" ? (
                                <CommercialInvoices
                                  key={s.path}
                                  kind={
                                    s.path === "/invoices" ? "purchase" : "sale"
                                  }
                                />
                              ) : (
                                <ResourcePage
                                  key={s.path}
                                  resource={s.path.slice(1)}
                                  title={s.title}
                                />
                              )
                            }
                          />
                        ))}
                      {[
                        "invoices",
                        "outgoing",
                        "transfers",
                        "writeoffs",
                        "products",
                        "charts",
                        "employees",
                        "cash-shifts",
                      ].map((r) => (
                        <Route
                          key={r}
                          path={"/" + r + "/:id"}
                          element={<DetailPage key={r} resource={r} />}
                        />
                      ))}
                      <Route
                        path="*"
                        element={
                          <div className="empty">
                            <h2>Страница не найдена</h2>
                            <Link to="/">Вернуться к обзору</Link>
                          </div>
                        }
                      />
                    </Routes>
                  )}
                </main>
              </ContentLayout>
              <footer className="page-footer">
                Chaika Team <span>Время: Крым, UTC+3 · Суммы в рублях</span>
              </footer>
            </div>
          </div>
        </AssistantProvider>
      </DocumentDataProvider>
    </WorkspaceContext.Provider>
  );
}

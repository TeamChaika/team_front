import {
  useEffect,
  useState,
  createContext,
  useContext,
  type FormEvent,
} from "react";
import { Routes, Route, NavLink, useLocation, Link } from "react-router-dom";
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
} from "@tabler/icons-react";
import { api, type Meta } from "./api";
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
export const sections = [
  { path: "/", title: "Обзор", icon: IconLayoutDashboard },
  { path: "/indicators", title: "Показатели", icon: IconActivity },
  { path: "/sales", title: "Продажи", icon: IconChartBar },
  { path: "/cash-shifts", title: "Кассовые смены", icon: IconReceipt },
  { path: "/invoices", title: "Приходные накладные", icon: IconReceipt },
  { path: "/purchase-prices", title: "Закупочные цены", icon: IconChartBar },
  { path: "/outgoing", title: "Расходные накладные", icon: IconArrowUpRight },
  { path: "/transfers", title: "Перемещения", icon: IconArrowsExchange },
  { path: "/writeoffs", title: "Списания", icon: IconTrash },
  { path: "/products", title: "Номенклатура", icon: IconPackages },
  { path: "/charts", title: "Технологические карты", icon: IconChefHat },
  {
    path: "/balances",
    title: "Остатки на складах",
    icon: IconBuildingWarehouse,
  },
  { path: "/employees", title: "Сотрудники", icon: IconUsers },
  { path: "/events", title: "События заказов", icon: IconRoute },
  { path: "/status", title: "Статус данных", icon: IconActivity },
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
            label="Электронная почта"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="name@chaika.team"
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
          <p className="login-note">
            Доступ к ресторанам назначает владелец системы.
          </p>
        </form>
      </div>
    </main>
  );
}
export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [departments, setDepartments] = useState<string[]>([]);
  const setDepartment = (id: string) => setDepartments(id ? [id] : []);
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(() => {
    let live = true;
    setChecking(true);
    api<Meta>("/me")
      .then((x) => {
        if (live) {
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
        if (live) {
          setMeta(null);
          if (e.status !== 401) setError(e.message);
        }
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    const lost = () => {
      setMeta(null);
      setDepartments([]);
    };
    window.addEventListener("session-lost", lost);
    return () => window.removeEventListener("session-lost", lost);
  }, []);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
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
  const title =
    sections.find((s) => s.path !== "/" && location.pathname.startsWith(s.path))
      ?.title ?? "Обзор";
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
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
    }
    setMeta(null);
    setDepartments([]);
  }
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
              {sections.map((s) => (
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
              <div className="connection">
                <i /> Данные из Supabase
              </div>
              <div className="user-card">
                <Avatar color="cyan" radius="md">
                  {meta.user.display_name[0]}
                </Avatar>
                <div>
                  <strong>{meta.user.display_name}</strong>
                  <small>
                    {meta.user.role === "owner"
                      ? "Владелец"
                      : meta.user.role === "manager"
                        ? "Менеджер"
                        : "Аналитик"}
                  </small>
                </div>
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
                <AssistantToggle />
                <Badge variant="light" color="cyan">
                  Первая версия
                </Badge>
              </div>
            </header>
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
            <AssistantLayout>
              <main className="content">
                <Routes>
                  <Route
                    path="/"
                    element={<Overview key={departments.join(",")} />}
                  />
                  <Route path="/sales" element={<SalesPage />} />
                  <Route
                    path="/indicators"
                    element={<Indicators key={meta.user.id} />}
                  />
                  <Route path="/purchase-prices" element={<PurchasePrices />} />
                  <Route path="/balances" element={<BalancesPage />} />
                  <Route path="/status" element={<StatusPage />} />
                  <Route path="/events/topology" element={<TopologyPage />} />
                  {sections
                    .filter(
                      (s) =>
                        ![
                          "/",
                          "/sales",
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
                          <ResourcePage
                            key={s.path}
                            resource={s.path.slice(1)}
                            title={s.title}
                          />
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
              </main>
            </AssistantLayout>
            <footer className="page-footer">
              Chaika Team <span>Время: Крым, UTC+3 · Суммы в рублях</span>
            </footer>
          </div>
        </div>
      </AssistantProvider>
    </WorkspaceContext.Provider>
  );
}

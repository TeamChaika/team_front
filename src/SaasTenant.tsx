import type { FeatureReadiness } from "./tenantFeatureReadiness";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  createTenantApi,
  TenantApiError,
  type TenantSession,
  type TenantWorkspace,
} from "./saasTenantApi";
import "./saasAdmin.css";
import { completePlatformLogin, startPlatformLogin } from "./platformSso";
import { tenantPasswordError } from "./saasAdminModel";

const TenantDashboard = lazy(() => import("./TenantDashboard"));

export default function SaasTenant({
  slug,
  companyName,
  companyId,
  platformOrigin,
  apiOrigin = "",
  fullDashboardReady = false,
  workingDashboardAvailable = false,
  fullDashboardAvailable = false,
  featureReadiness,
  setupOnly = false,
  setupAvailable = false,
}: {
  slug: string;
  companyName?: string;
  companyId?: string;
  platformOrigin?: string;
  apiOrigin?: string;
  fullDashboardReady?: boolean;
  workingDashboardAvailable?: boolean;
  fullDashboardAvailable?: boolean;
  featureReadiness?: FeatureReadiness;
  setupOnly?: boolean;
  setupAvailable?: boolean;
}) {
  const api = useMemo(
    () => createTenantApi(slug, apiOrigin),
    [slug, apiOrigin],
  );
  const [session, setSession] = useState<TenantSession | null>(null);
  const [workspace, setWorkspace] = useState<TenantWorkspace | null>(null);
  const workingAvailable =
    workspace?.working_dashboard_available ?? workingDashboardAvailable;
  const fullReady = workspace?.full_dashboard_ready ?? fullDashboardReady;
  const fullAvailable =
    workspace?.full_dashboard_available ?? fullDashboardAvailable;
  const preserveHistoryReads = fullAvailable && !workingAvailable && !fullReady;
  const effectiveSetupOnly =
    setupOnly && !workingAvailable && !fullReady && !fullAvailable;
  const ownerSetupAvailable =
    (workspace?.setup_available ?? setupAvailable) &&
    session?.actor?.kind === "platform_owner" &&
    !preserveHistoryReads;
  const readiness = effectiveSetupOnly
    ? undefined
    : (workspace?.feature_readiness ??
      featureReadiness ??
      (workingAvailable ? {} : undefined));
  const dashboardRuntime = useMemo(
    () =>
      api.dashboardRuntime(
        () => {
          setSession(null);
          setWorkspace(null);
        },
        () => {
          void api
            .me()
            .then(setSession)
            .catch(() => {
              setSession(null);
              setWorkspace(null);
            });
        },
        fullReady || workingAvailable || fullAvailable || effectiveSetupOnly,
        readiness,
        preserveHistoryReads,
        ownerSetupAvailable,
      ),
    [
      api,
      fullReady,
      fullAvailable,
      effectiveSetupOnly,
      workingAvailable,
      readiness,
      preserveHistoryReads,
      ownerSetupAvailable,
    ],
  );
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const previous = document.title;
    document.title =
      session?.company.name || companyName || "Рабочее пространство";
    return () => {
      document.title = previous;
    };
  }, [companyName, session?.company.name]);
  function clearSecrets() {
    setPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
  }
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(async () => {
        if (companyId) await completePlatformLogin(slug, companyId, apiOrigin);
        if (
          companyId &&
          platformOrigin &&
          new URLSearchParams(window.location.search).get("owner_login") === "1"
        ) {
          await startPlatformLogin(companyId, platformOrigin);
        }
        return api.me();
      })
      .then((data) => {
        if (live) setSession(data);
      })
      .catch((e) => {
        if (live && (!(e instanceof TenantApiError) || e.status !== 401))
          setError(e.message);
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [api]);
  useEffect(() => {
    setWorkspace(null);
    if (!session || session.must_change_password) return;
    let live = true;
    setWorkspaceLoading(true);
    api
      .workspace()
      .then((data) => {
        if (live) setWorkspace(data);
      })
      .catch(async (e) => {
        if (!live) return;
        if (e.code === "password_change_required") {
          try {
            const data = await api.me();
            if (live) setSession(data);
          } catch {
            if (live) {
              setSession(null);
              clearSecrets();
            }
          }
        } else if (e.status === 401 || e.status === 403 || e.status === 404) {
          setSession(null);
          clearSecrets();
          setError(e.message);
        } else setError(e.message);
      })
      .finally(() => {
        if (live) setWorkspaceLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, session, retry]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (session?.must_change_password) {
      const problem = tenantPasswordError(newPassword, confirmation);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const data = session?.must_change_password
        ? await api.password(currentPassword, newPassword)
        : await api.login(username.trim(), password);
      setSession(data);
      clearSecrets();
    } catch (e) {
      setError((e as Error).message);
      if (session && e instanceof TenantApiError && e.status === 401) {
        setSession(null);
        clearSecrets();
      }
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    clearSecrets();
    try {
      await api.logout();
      setSession(null);
      setWorkspace(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (checking)
    return (
      <main className="sa-auth">
        <p role="status">Проверяем вход компании…</p>
      </main>
    );
  if (!session || session.must_change_password)
    return (
      <main className="sa-auth">
        <div className="sa-login">
          <span className="sa-eyebrow">ВХОД КОМПАНИИ</span>
          <h1>{session ? "Задайте свой пароль" : "Вход в компанию"}</h1>
          <p className="sa-hint">
            {session
              ? session.company.name
              : companyName || `Компания: ${slug}`}
          </p>
          {session && (
            <p className="sa-hint">
              Перед началом работы замените временный пароль. Не менее 8
              символов.
            </p>
          )}
          <form onSubmit={submit}>
            {error && (
              <p className="sa-error" role="alert">
                {error}
              </p>
            )}
            {!session ? (
              <>
                <label className="sa-field">
                  Email
                  <input
                    autoFocus
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label className="sa-field">
                  Пароль
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="sa-field">
                  Временный пароль
                  <input
                    autoFocus
                    required
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label className="sa-field">
                  Новый пароль
                  <input
                    required
                    minLength={8}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label className="sa-field">
                  Повторите новый пароль
                  <input
                    required
                    minLength={8}
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
              </>
            )}
            <button className="sa-button" disabled={busy}>
              {busy ? "Подождите…" : session ? "Сохранить пароль" : "Войти"}
            </button>
          </form>
          {session ? (
            <button
              className="sa-text-button sa-tenant-link"
              disabled={busy}
              onClick={() => void logout()}
            >
              Выйти
            </button>
          ) : (
            <>
              <a className="sa-text-button" href="/forgot-password">
                Забыли пароль?
              </a>
              <p className="sa-hint">
                Данные для входа выдаёт владелец сервиса.
              </p>
              {companyId && platformOrigin && (
                <button
                  className="sa-text-button"
                  onClick={() =>
                    void startPlatformLogin(companyId, platformOrigin).catch(
                      (e) => setError(e.message),
                    )
                  }
                >
                  Вход владельца сервиса
                </button>
              )}
            </>
          )}
        </div>
      </main>
    );
  if (workspace)
    return (
      <>
        {session?.actor?.kind === "platform_owner" && (
          <aside
            className="tenant-owner-banner"
            aria-label="Контекст владельца"
          >
            <span>{workspace.company.name} · Владелец сервиса</span>
            <a href={platformOrigin}>В SaaS ↗</a>
          </aside>
        )}
        {effectiveSetupOnly && (
          <p className="tenant-setup-notice">
            Настройка компании. Рабочие разделы появятся после завершения
            проверки.
          </p>
        )}
        <Suspense
          fallback={
            <main className="center-screen" role="status">
              Открываем рабочее пространство…
            </main>
          }
        >
          <TenantDashboard
            runtime={dashboardRuntime}
            preserveHistoryReads={preserveHistoryReads}
            ownerSetupAvailable={ownerSetupAvailable}
            setupOnly={effectiveSetupOnly}
            companyName={workspace.company.name}
            companyId={workspace.company.id}
            logout={logout}
            error={error}
            basename={
              window.location.pathname.startsWith(`/tenant/${slug}`)
                ? `/tenant/${slug}`
                : "/"
            }
          />
        </Suspense>
      </>
    );
  return (
    <main className="sa-auth">
      <div className="sa-login">
        <h1>{session.company.name}</h1>
        {error ? (
          <p className="sa-error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Загружаем компанию…</p>
        )}
        {!workspaceLoading && (
          <button
            className="sa-button"
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            Повторить
          </button>
        )}
        <button className="sa-text-button" onClick={() => void logout()}>
          Выйти
        </button>
      </div>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  createTenantApi,
  TenantApiError,
  type TenantSession,
  type TenantWorkspace,
} from "./saasTenantApi";
import { moduleLabels, tenantPasswordError } from "./saasAdminModel";

export default function SaasTenant({ slug }: { slug: string }) {
  const api = useMemo(() => createTenantApi(slug), [slug]);
  const [session, setSession] = useState<TenantSession | null>(null);
  const [workspace, setWorkspace] = useState<TenantWorkspace | null>(null);
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
  function clearSecrets() {
    setPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
  }
  useEffect(() => {
    let live = true;
    api
      .me()
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
          <span className="sa-eyebrow">RESTCONTROL · ВХОД КОМПАНИИ</span>
          <h1>{session ? "Задайте свой пароль" : "Вход администратора"}</h1>
          <p className="sa-hint">
            {session ? session.company.name : `Компания: ${slug}`}
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
                  Логин
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
            <p className="sa-hint">Данные для входа выдаёт владелец сервиса.</p>
          )}
        </div>
      </main>
    );
  return (
    <main className="sa-tenant-workspace">
      <header>
        <div>
          <span className="sa-eyebrow">RESTCONTROL · КОМПАНИЯ</span>
          <h1>{session.company.name}</h1>
          <p className="sa-hint">
            {session.user.display_name} · {session.user.username}
          </p>
        </div>
        <button
          className="sa-button secondary"
          disabled={busy}
          onClick={() => void logout()}
        >
          Выйти
        </button>
      </header>
      {error && (
        <div className="sa-error" role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            Повторить
          </button>
        </div>
      )}
      {workspaceLoading && (
        <p role="status" className="sa-hint">
          Загружаем компанию…
        </p>
      )}
      {workspace && (
        <section className="sa-card">
          <h2>Рабочее пространство</h2>
          <p>
            Вход настроен. Подключение модулей и данных компании ещё не
            завершено.
          </p>
          <div className="sa-module-tags">
            {Object.entries(workspace.company.modules)
              .filter(([, enabled]) => enabled)
              .map(([key]) => (
                <span key={key}>
                  {moduleLabels[key as keyof typeof moduleLabels]}
                </span>
              ))}
          </div>
          {!Object.values(workspace.company.modules).some(Boolean) && (
            <p className="sa-hint">Модули пока не выбраны.</p>
          )}
        </section>
      )}
    </main>
  );
}

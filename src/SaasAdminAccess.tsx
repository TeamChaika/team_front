import { useEffect, useRef, useState } from "react";
import { api } from "./saasAdminApi";
import {
  adminAccessLabels,
  loadAdminAccessSnapshot,
  tenantLoginPath,
  type AdminAccess,
  type Company,
  type IssuedAdminAccess,
} from "./saasAdminModel";

export default function SaasAdminAccess({
  company,
  onVersion,
  onCompany,
}: {
  company: Company;
  onVersion: (version: number) => void;
  onCompany: (company: Company) => void;
}) {
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [issued, setIssued] = useState<IssuedAdminAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const live = useRef(true);
  const actionButton = useRef<HTMLButtonElement>(null);
  const companyCallback = useRef(onCompany);
  companyCallback.current = onCompany;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadAdminAccessSnapshot(
      company,
      () => api.adminAccess(company.id, controller.signal),
      () => api.company(company.id, controller.signal),
    )
      .then(({ access: metadata, company: snapshot }) => {
        if (controller.signal.aborted) return;
        setAccess(metadata);
        if (snapshot.version !== company.version)
          companyCallback.current(snapshot);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [company.id, company.version, retry]);
  async function issue(reset: boolean) {
    if (
      busy ||
      loading ||
      !access ||
      access.company_version !== company.version
    )
      return;
    setBusy(true);
    setError("");
    setIssued(null);
    setCopied(false);
    try {
      const data = await api.issueAdminAccess(
        company.id,
        company.version,
        reset,
      );
      if (!live.current) return;
      const { temporary_password, ...metadata } = data;
      setAccess(metadata);
      setIssued({ ...metadata, temporary_password });
      setConfirm(false);
      onVersion(data.company_version);
    } catch (e) {
      if (live.current) {
        setError((e as Error).message);
        setConfirm(false);
        setRetry((n) => n + 1);
      }
    } finally {
      if (live.current) setBusy(false);
    }
  }
  function closeDialog() {
    setIssued(null);
    setConfirm(false);
    setCopied(false);
    actionButton.current?.focus();
  }
  const path = tenantLoginPath(company.slug);
  const canCreate =
    !!company.primary_admin?.name.trim() &&
    !!company.primary_admin?.email.trim();
  return (
    <section className="sa-admin-access">
      <h3>Доступ администратора</h3>
      {loading ? (
        <p className="sa-hint" role="status">
          Проверяем доступ…
        </p>
      ) : access?.admin ? (
        <>
          <strong>{access.admin.display_name}</strong>
          <p>{access.admin.username}</p>
          <p className="sa-hint">{adminAccessLabels[access.admin.status]}</p>
        </>
      ) : (
        !error && <p className="sa-muted">Доступ ещё не создан</p>
      )}
      {error && (
        <p className="sa-field-error" role="alert">
          {error}{" "}
          <button
            className="sa-text-button"
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            Повторить
          </button>
        </p>
      )}
      {access && !loading && (
        <>
          {!access.exists && (
            <p className="sa-hint">
              Создайте учётную запись по сохранённым имени и email контакта.
              Пароль появится один раз.
            </p>
          )}
          {!access.exists && !canCreate && (
            <p className="sa-hint">
              Сначала сохраните имя и email контакта администратора.
            </p>
          )}
          <button
            ref={actionButton}
            className={`sa-button ${access.exists ? "secondary " : ""}small`}
            disabled={
              busy ||
              access.company_version !== company.version ||
              company.status === "suspended" ||
              (!access.exists && !canCreate)
            }
            onClick={() =>
              access.exists ? setConfirm(true) : void issue(false)
            }
          >
            {busy
              ? "Создаём…"
              : access.exists
                ? "Сбросить пароль"
                : "Создать доступ"}
          </button>
          {access.exists && (
            <a
              className="sa-text-button sa-tenant-link"
              href={path}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть вход компании ↗
            </a>
          )}
          <p className="sa-hint">
            Вход компании в RestControl. Модули и данные подключаются отдельно.
          </p>
        </>
      )}
      {(confirm || issued) && (
        <div className="sa-overlay">
          <div
            className="sa-dialog sa-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-access-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) closeDialog();
              if (e.key === "Tab") {
                const controls = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), a[href], input",
                  ),
                );
                if (e.shiftKey && document.activeElement === controls[0]) {
                  e.preventDefault();
                  controls.at(-1)?.focus();
                } else if (
                  !e.shiftKey &&
                  document.activeElement === controls.at(-1)
                ) {
                  e.preventDefault();
                  controls[0]?.focus();
                }
              }
            }}
          >
            <h2 id="sa-access-title">
              {issued
                ? "Доступ администратора готов"
                : "Сбросить пароль администратора?"}
            </h2>
            {issued ? (
              <>
                <p>
                  Сохраните данные сейчас. После закрытия временный пароль
                  больше не отобразится. При входе администратор задаст свой
                  пароль.
                </p>
                <label className="sa-field">
                  Логин
                  <input readOnly value={issued.admin?.username || ""} />
                </label>
                <label className="sa-field">
                  Временный пароль
                  <input
                    readOnly
                    value={issued.temporary_password}
                    autoComplete="off"
                  />
                </label>
                <a
                  className="sa-tenant-link"
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {window.location.origin}
                  {path} ↗
                </a>
                <p className="sa-hint">Пароль действует 72 часа.</p>
                <div>
                  <button
                    autoFocus
                    className="sa-button secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `Вход: ${window.location.origin}${path}\nЛогин: ${issued.admin?.username}\nВременный пароль: ${issued.temporary_password}`,
                        );
                        if (live.current) setCopied(true);
                      } catch {
                        if (live.current)
                          setError(
                            "Не удалось скопировать. Выделите данные вручную.",
                          );
                      }
                    }}
                  >
                    {copied ? "Скопировано" : "Скопировать"}
                  </button>
                  <button className="sa-button" onClick={closeDialog}>
                    Закрыть
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Прежний пароль перестанет работать, все сеансы администратора
                  завершатся. Новый временный пароль появится один раз.
                </p>
                <div>
                  <button
                    autoFocus
                    className="sa-button secondary"
                    disabled={busy}
                    onClick={closeDialog}
                  >
                    Отмена
                  </button>
                  <button
                    className="sa-button"
                    disabled={busy}
                    onClick={() => void issue(true)}
                  >
                    {busy ? "Сбрасываем…" : "Сбросить пароль"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

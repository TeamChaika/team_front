import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./saasAdminApi";
import {
  connectionCredentialError,
  connectionLoadMatchesCompany,
  type ConnectionLoadScope,
  type Company,
  type Connection,
  type ConnectionCheck,
  type ConnectionCredential,
} from "./saasAdminModel";
export function ConnectionResult({
  check,
  pending = false,
}: {
  check?: ConnectionCheck;
  pending?: boolean;
}) {
  return (
    <div
      className={`sa-connection-result ${pending ? "pending" : check?.status || "not_checked"}`}
      role="status"
    >
      <strong>
        {pending
          ? "Проверяем соединение…"
          : check?.status === "ok"
            ? "Авторизация успешна"
            : check?.status === "failed"
              ? "Ошибка соединения"
              : "Не проверено"}
      </strong>
      {!pending && check?.message && <span>{check.message}</span>}
      {!pending && check?.checked_at && (
        <small>{new Date(check.checked_at).toLocaleString("ru-RU")}</small>
      )}
    </div>
  );
}
export function ConnectionEditor({
  id,
  url,
  company,
  stored,
  draft,
  onChange,
  onPending,
  disabled,
  error,
}: {
  id: string;
  url: string;
  company?: Company;
  stored?: Connection;
  draft?: ConnectionCredential;
  onChange: (value: ConnectionCredential) => void;
  onPending: (id: string, pending: boolean) => void;
  disabled: boolean;
  error?: string;
}) {
  const credential = draft || { login: stored?.login || "" };
  const unchanged =
    !!stored &&
    stored.url === url.trim() &&
    stored.login === credential.login.trim() &&
    !credential.password;
  const [check, setCheck] = useState<ConnectionCheck>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const invalidate = () => {
    generation.current++;
    controller.current?.abort();
    setPending(false);
    onPending(id, false);
    setCheck(undefined);
    setFailure("");
  };
  useEffect(() => {
    invalidate();
    return () => {
      generation.current++;
      controller.current?.abort();
      onPending(id, false);
    };
  }, [url, credential.login, credential.password]);
  async function test() {
    if (pending || disabled) return;
    const invalid = connectionCredentialError(url, credential, stored);
    if (invalid) {
      setFailure(invalid);
      return;
    }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setFailure("Укажите полный HTTP или HTTPS адрес");
      return;
    }
    const current = ++generation.current;
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    onPending(id, true);
    setFailure("");
    setCheck(undefined);
    try {
      const result = await api.testDraftConnection(
        {
          url: url.trim(),
          login: credential.login.trim(),
          ...(credential.password ? { password: credential.password } : {}),
          ...(company
            ? {
                company_id: company.id,
                connection_id: id,
                expected_version: company.version,
              }
            : {}),
        },
        request.signal,
      );
      if (generation.current === current && !request.signal.aborted)
        setCheck(result);
    } catch (err) {
      if (generation.current === current && !request.signal.aborted)
        setFailure((err as Error).message);
    } finally {
      if (generation.current === current) {
        setPending(false);
        onPending(id, false);
      }
    }
  }
  return (
    <div className="sa-connection-editor">
      <div className="sa-form-grid">
        <label className="sa-field">
          Логин iiko
          <input
            autoComplete="off"
            value={credential.login}
            disabled={disabled}
            onChange={(e) => {
              invalidate();
              onChange({ ...credential, login: e.target.value });
            }}
          />
        </label>
        <label className="sa-field">
          Пароль iiko
          <input
            type="password"
            autoComplete="new-password"
            value={credential.password || ""}
            disabled={disabled}
            placeholder={
              stored?.password_set
                ? "Сохранён · оставьте пустым, чтобы сохранить"
                : "Введите пароль"
            }
            onChange={(e) => {
              invalidate();
              onChange({ ...credential, password: e.target.value });
            }}
          />
        </label>
      </div>
      {(error || failure) && (
        <p className="sa-field-error" role="alert">
          {error || failure}
        </p>
      )}
      <div className="sa-connection-test-row">
        <button
          type="button"
          disabled={pending || disabled || !url.trim()}
          className="sa-button secondary small"
          onClick={test}
        >
          Проверить соединение
        </button>
        <ConnectionResult
          pending={pending}
          check={check || (unchanged ? stored?.check : undefined)}
        />
      </div>
      <p className="sa-hint">Проверка доступна для HTTPS на порту 443.</p>
      {check?.status === "ok" && (
        <p className="sa-hint">
          Проверена авторизация. После сохранения проверьте соединение в
          карточке компании.
        </p>
      )}
    </div>
  );
}
export default function SavedConnections({
  company,
  onVersion,
  onRefresh,
  onEdit,
}: {
  company: Company;
  onVersion: (version: number) => void;
  onRefresh: () => void;
  onEdit: () => void;
}) {
  const [items, setItems] = useState<Connection[]>([]);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<
    (ConnectionLoadScope & { status: "loading" | "loaded" | "failed" }) | null
  >(null);
  const [needsCompanyRefresh, setNeedsCompanyRefresh] = useState(false);
  const matches = connectionLoadMatchesCompany(scope, company);
  const ready = matches && scope?.status === "loaded";
  const waiting = !matches || scope?.status === "loading";
  const currentError = matches ? error : "";
  const [pending, setPending] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const live = useRef(0);
  const version = useRef(company.version);
  version.current = company.version;
  useEffect(() => {
    const epoch = ++live.current;
    const request = new AbortController();
    controller.current?.abort();
    setPending(null);
    const nextScope = { company_id: company.id, version: company.version };
    setScope({ ...nextScope, status: "loading" });
    setItems([]);
    setNeedsCompanyRefresh(false);
    setError("");
    api
      .connections(company.id, request.signal)
      .then((data) => {
        if (live.current === epoch) {
          setItems(data.items);
          setScope({ ...nextScope, status: "loaded" });
        }
      })
      .catch((err) => {
        if (live.current === epoch && !request.signal.aborted) {
          setItems([]);
          setScope({ ...nextScope, status: "failed" });
          setError(err.message);
        }
      });
    return () => {
      live.current++;
      request.abort();
      controller.current?.abort();
    };
  }, [company.id, company.version, reload]);
  async function test(connection: Connection) {
    if (pending || !ready || !items.some((item) => item.id === connection.id))
      return;
    const epoch = live.current;
    const request = new AbortController();
    controller.current = request;
    setPending(connection.id);
    setError("");
    try {
      const result = await api.testConnection(
        company.id,
        connection.id,
        version.current,
        request.signal,
      );
      if (epoch !== live.current || request.signal.aborted) return;
      setItems((current) =>
        current.map((item) =>
          item.id === connection.id ? result.connection : item,
        ),
      );
      onVersion(result.company_version);
    } catch (err) {
      if (epoch === live.current && !request.signal.aborted) {
        setError((err as Error).message);
        if (err instanceof ApiError && err.status === 409) {
          setItems([]);
          setScope({
            company_id: company.id,
            version: company.version,
            status: "failed",
          });
          setNeedsCompanyRefresh(true);
          onRefresh();
        }
      }
    } finally {
      if (epoch === live.current) setPending(null);
    }
  }
  return (
    <div className="sa-saved-connections">
      {waiting ? (
        <p className="sa-hint" role="status">
          Загружаем подключения…
        </p>
      ) : ready && items.length ? (
        items.map((connection) => (
          <article className="sa-saved-connection" key={connection.id}>
            <h4>
              {connection.id === "chain"
                ? "iiko Chain"
                : company.rms.find((r) => r.id === connection.id)?.label ||
                  "RMS"}
            </h4>
            <p className="sa-url">{connection.url}</p>
            <p className="sa-hint">
              Логин: {connection.login || "Не задан"} ·{" "}
              {connection.password_set ? "Пароль сохранён" : "Пароль не задан"}
            </p>
            <ConnectionResult
              check={connection.check}
              pending={pending === connection.id}
            />
            <button
              className="sa-button secondary small"
              disabled={
                !ready ||
                !!pending ||
                !connection.login ||
                !connection.password_set
              }
              onClick={() => test(connection)}
            >
              Проверить соединение
            </button>
            {(!connection.login || !connection.password_set) && (
              <button className="sa-text-button" onClick={onEdit}>
                Указать логин и пароль
              </button>
            )}
          </article>
        ))
      ) : ready ? (
        <p className="sa-hint">Подключения не настроены</p>
      ) : null}
      {currentError && (
        <div className="sa-error" role="alert">
          {currentError}
          <button
            onClick={() => {
              onRefresh();
              if (!needsCompanyRefresh) setReload((n) => n + 1);
            }}
          >
            Обновить данные
          </button>
        </div>
      )}
      <p className="sa-hint">
        Проверка подтверждает соединение и авторизацию, доступ к модулям
        проверяется отдельно.
      </p>
    </div>
  );
}

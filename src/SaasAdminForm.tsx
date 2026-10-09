import { useCallback, useEffect, useRef, useState } from "react";
import { IconPlus, IconX, IconTrash } from "@tabler/icons-react";
import SaasEntitlements from "./SaasEntitlements";
import { ConnectionEditor } from "./SaasAdminConnection";
import { api, ApiError } from "./saasAdminApi";
import {
  emptyCompany,
  connectionCredentialError,
  type Connection,
  type ConnectionCredential,
  moduleLabels,
  normalizeCompany,
  statusLabels,
  validateCompany,
  type Company,
  type CompanyWrite,
} from "./saasAdminModel";
export default function SaasAdminForm({
  company,
  initialTab = 0,
  onClose,
  onSaved,
}: {
  company?: Company;
  initialTab?: 0 | 1 | 2;
  onClose: () => void;
  onSaved: (c: Company) => void;
}) {
  const [value, setValue] = useState<CompanyWrite>(() =>
    company ? normalizeCompany(company) : emptyCompany(),
  );
  const [tab, setTab] = useState<number>(initialTab);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionLoadError, setConnectionLoadError] = useState("");
  const [pendingChecks, setPendingChecks] = useState<Record<string, boolean>>(
    {},
  );
  const checkingConnection = Object.values(pendingChecks).some(Boolean);
  const onPending = useCallback(
    (id: string, pending: boolean) =>
      setPendingChecks((current) =>
        current[id] === pending ? current : { ...current, [id]: pending },
      ),
    [],
  );
  useEffect(() => {
    if (!company) return;
    const request = new AbortController();
    api
      .connections(company.id, request.signal)
      .then((data) => setConnections(data.items))
      .catch((error) => {
        if (!request.signal.aborted) setConnectionLoadError(error.message);
      });
    return () => request.abort();
  }, [company?.id]);
  const ref = useRef<HTMLDivElement>(null);
  const prior = useRef<HTMLElement | null>(null);
  useEffect(() => {
    prior.current = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => prior.current?.focus();
  }, []);
  function change<K extends keyof CompanyWrite>(key: K, next: CompanyWrite[K]) {
    setValue((v) => ({ ...v, [key]: next }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || checkingConnection) return;
    if (tab < 2) {
      setTab((current) => Math.min(2, current + 1));
      return;
    }
    const normalized = normalizeCompany(value);
    const problems = validateCompany(normalized);
    for (const [id, url] of [
      ["chain", normalized.chain_url],
      ...normalized.rms.map((r) => [r.id, r.url]),
    ] as [string, string | null][]) {
      if (!url) continue;
      const stored = connections.find((connection) => connection.id === id);
      const draft = normalized.connection_credentials?.[id];
      const previousUrl =
        id === "chain"
          ? company?.chain_url
          : company?.rms.find((r) => r.id === id)?.url;
      if (draft || url !== previousUrl) {
        const issue = connectionCredentialError(
          url,
          draft || { login: stored?.login || "" },
          stored,
        );
        if (issue) problems[`connection_credentials.${id}`] = issue;
      }
    }
    setErrors(problems);
    if (Object.keys(problems).length) {
      setTab(problems.name || problems.slug ? 0 : problems.end_date ? 2 : 1);
      setError("Проверьте выделенные поля.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await api.save(normalized, company));
    } catch (err) {
      if (err instanceof ApiError && err.field) {
        setErrors({ [err.field]: err.message });
        setTab(
          err.field.startsWith("subscription")
            ? 2
            : err.field.startsWith("rms") ||
                err.field.startsWith("connection_credentials") ||
                err.field === "chain_url"
              ? 1
              : 0,
        );
      }
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }
  const credentialEditor = (id: string, url: string) => (
    <ConnectionEditor
      id={id}
      url={url}
      company={company}
      stored={connections.find((connection) => connection.id === id)}
      draft={value.connection_credentials?.[id]}
      disabled={saving}
      error={errors[`connection_credentials.${id}`]}
      onPending={onPending}
      onChange={(credential: ConnectionCredential) =>
        change("connection_credentials", {
          ...value.connection_credentials,
          [id]: credential,
        })
      }
    />
  );
  const field = (
    label: string,
    key: "name" | "slug" | "domain" | "chain_url",
    placeholder = "",
    required = false,
  ) => (
    <label className="sa-field">
      {label}
      {required && " *"}
      <input
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `err-${key}` : undefined}
        required={required}
        value={value[key] || ""}
        placeholder={placeholder}
        onChange={(e) =>
          change(key, e.target.value || ((required ? "" : null) as never))
        }
      />
      {errors[key] && (
        <span className="sa-field-error" id={`err-${key}`}>
          {errors[key]}
        </span>
      )}
    </label>
  );
  return (
    <div
      className="sa-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sa-form-title"
        className="sa-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) onClose();
          if (e.key === "Tab") {
            const items = Array.from(
              ref.current!.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input,select,textarea,a[href]",
              ),
            ).filter((x) => x.offsetParent !== null);
            if (e.shiftKey && document.activeElement === items[0]) {
              e.preventDefault();
              items.at(-1)?.focus();
            } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
              e.preventDefault();
              items[0]?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <span className="sa-eyebrow">РЕЕСТР КОМПАНИЙ</span>
            <h2 id="sa-form-title">
              {company ? "Изменить компанию" : "Новая компания"}
            </h2>
          </div>
          <button
            className="sa-icon-button"
            disabled={saving}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <IconX size={21} />
          </button>
        </header>
        <div className="sa-form-tabs">
          {["Компания", "Подключения", "Доступы и подписка"].map((name, i) => (
            <button
              key={name}
              className={tab === i ? "selected" : ""}
              onClick={() => setTab(i)}
            >
              {i + 1}. {name}
            </button>
          ))}
        </div>
        <form onSubmit={submit} noValidate>
          <div className="sa-form-body">
            {error && (
              <div role="alert" className="sa-error">
                {error}
              </div>
            )}
            {tab === 0 && (
              <>
                <div className="sa-form-grid">
                  {field("Название", "name", "Название организации", true)}
                  {field("Идентификатор", "slug", "company-name", true)}
                  {field("Домен", "domain", "dashboard.company.ru")}
                  <label className="sa-field">
                    Статус регистрации
                    <select
                      value={value.status}
                      onChange={(e) =>
                        change(
                          "status",
                          e.target.value as CompanyWrite["status"],
                        )
                      }
                    >
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <h3>Контакт администратора</h3>
                <p className="sa-hint">
                  Контактное лицо компании. После сохранения создайте доступ
                  отдельной кнопкой в карточке.
                </p>
                <div className="sa-form-grid">
                  {(["name", "email", "phone"] as const).map((key, i) => (
                    <label className="sa-field" key={key}>
                      {["Имя", "Email", "Телефон"][i]}
                      <input
                        type={key === "email" ? "email" : "text"}
                        value={value.primary_admin?.[key] || ""}
                        onChange={(e) =>
                          change("primary_admin", {
                            name: "",
                            email: "",
                            phone: "",
                            ...value.primary_admin,
                            [key]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="sa-field">
                  Заметки
                  <textarea
                    rows={3}
                    value={value.notes}
                    onChange={(e) => change("notes", e.target.value)}
                  />
                </label>
              </>
            )}
            {tab === 1 && (
              <>
                {field(
                  "iiko Chain URL",
                  "chain_url",
                  "https://chain.company.ru",
                )}
                {connectionLoadError && (
                  <p className="sa-field-error" role="alert">
                    {connectionLoadError}
                  </p>
                )}
                {value.chain_url && credentialEditor("chain", value.chain_url)}
                <p className="sa-hint">
                  Пароли сохраняются защищённо и не отображаются после
                  сохранения.
                </p>
                <div className="sa-section-heading">
                  <h3>Серверы RMS</h3>
                  <button
                    type="button"
                    className="sa-button secondary small"
                    onClick={() =>
                      change("rms", [
                        ...value.rms,
                        {
                          id: crypto.randomUUID(),
                          label: "",
                          url: "",
                          enabled: true,
                        },
                      ])
                    }
                  >
                    <IconPlus size={16} /> Добавить RMS
                  </button>
                </div>
                {value.rms.length === 0 && (
                  <div className="sa-empty-inline">
                    Серверы RMS пока не добавлены
                  </div>
                )}
                {value.rms.map((r, i) => (
                  <div className="sa-rms" key={r.id}>
                    <label className="sa-field">
                      Название
                      <input
                        value={r.label}
                        onChange={(e) =>
                          change(
                            "rms",
                            value.rms.map((x) =>
                              x.id === r.id
                                ? { ...x, label: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="sa-field">
                      URL
                      <input
                        aria-invalid={!!errors[`rms.${i}.url`]}
                        value={r.url}
                        placeholder="https://rms.company.ru"
                        onChange={(e) =>
                          change(
                            "rms",
                            value.rms.map((x) =>
                              x.id === r.id ? { ...x, url: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      {errors[`rms.${i}.url`] && (
                        <span className="sa-field-error">
                          {errors[`rms.${i}.url`]}
                        </span>
                      )}
                    </label>
                    <div className="sa-rms-credentials">
                      {credentialEditor(r.id, r.url)}
                    </div>
                    <label className="sa-check">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) =>
                          change(
                            "rms",
                            value.rms.map((x) =>
                              x.id === r.id
                                ? { ...x, enabled: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                      Включён в реестр
                    </label>
                    <button
                      className="sa-icon-button danger"
                      type="button"
                      aria-label={`Удалить RMS ${r.label || i + 1}`}
                      onClick={() =>
                        change(
                          "rms",
                          value.rms.filter((x) => x.id !== r.id),
                        )
                      }
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                ))}
              </>
            )}
            {tab === 2 && (
              <>
                <h3>Модули</h3>
                <div className="sa-module-grid">
                  {Object.entries(moduleLabels).map(([key, label]) => (
                    <label key={key} className="sa-module-option">
                      <input
                        type="checkbox"
                        checked={
                          value.modules[key as keyof CompanyWrite["modules"]]
                        }
                        onChange={(e) =>
                          change("modules", {
                            ...value.modules,
                            [key]: e.target.checked,
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <SaasEntitlements
                  value={value}
                  onChange={(subscription) =>
                    change("subscription", subscription)
                  }
                  disabled={saving}
                />
              </>
            )}
          </div>
          <footer>
            <span className="sa-hint">
              {tab === 0 ? "* Обязательные поля" : `Шаг ${tab + 1} из 3`}
            </span>
            <div>
              <button
                type="button"
                disabled={saving}
                className="sa-button secondary"
                onClick={onClose}
              >
                Отмена
              </button>
              {tab < 2 ? (
                <button
                  type="button"
                  className="sa-button"
                  key="next-step"
                  onClick={(event) => {
                    event.preventDefault();
                    setTab((current) => Math.min(2, current + 1));
                  }}
                >
                  Далее
                </button>
              ) : (
                <button
                  key="save-company"
                  className="sa-button"
                  disabled={saving || checkingConnection}
                  type="submit"
                >
                  {saving
                    ? "Сохранение…"
                    : company
                      ? "Сохранить изменения"
                      : "Добавить компанию"}
                </button>
              )}
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { api } from "./saasAdminApi";
import {
  moduleSettingsWrite,
  type ModuleSettings,
  type Seller,
} from "./companyModuleSettingsModel";

const sellerFields: [keyof Seller, string][] = [
  ["name", "Название продавца"],
  ["inn", "ИНН"],
  ["kpp", "КПП"],
  ["address", "Адрес"],
  ["phone", "Телефон"],
  ["bank_name", "Банк"],
  ["bic", "БИК"],
  ["account", "Расчётный счёт"],
  ["correspondent_account", "Корреспондентский счёт"],
];
const blankSeller = (): Seller =>
  Object.fromEntries(sellerFields.map(([field]) => [field, ""])) as Seller;
export default function SaasCompanyModuleSettings({
  companyId,
  version,
  onVersion,
}: {
  companyId: string;
  version: number;
  onVersion(version: number): void;
}) {
  const [settings, setSettings] = useState<ModuleSettings | null>(null);
  const [seller, setSeller] = useState<Seller>(blankSeller);
  const [sellerEnabled, setSellerEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [key, setKey] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSettings(null);
    setToken("");
    setKey("");
    setClearToken(false);
    setClearKey(false);
    setError("");
    api
      .moduleSettings(companyId, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setSettings(value);
        setSeller(value.seller || blankSeller());
        setSellerEnabled(Boolean(value.seller));
        if (value.company_version !== version) onVersion(value.company_version);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Не удалось загрузить настройки компании.");
      });
    return () => controller.abort();
  }, [companyId, version, retry]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings || busy || settings.company_version !== version) return;
    let body;
    try {
      body = moduleSettingsWrite(
        settings,
        sellerEnabled ? seller : null,
        token,
        clearToken,
        key,
        clearKey,
      );
    } catch {
      setError("Нельзя одновременно заменить и удалить секрет.");
      return;
    }
    setToken("");
    setKey("");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await api.saveModuleSettings(companyId, body);
      if (!live.current) return;
      setSettings(value);
      setClearToken(false);
      setClearKey(false);
      onVersion(value.company_version);
      setNotice(
        "Настройки сохранены. Для запуска компании нужна повторная проверка.",
      );
    } catch {
      if (live.current)
        setError(
          "Не удалось сохранить настройки. Обновите карточку; новые секреты при повторной попытке нужно ввести заново.",
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <div className="sa-module-settings">
      <h3>Продавец, Telegram и помощник</h3>
      <p className="sa-hint">
        Настройки принадлежат только этой компании. Секреты нельзя прочитать
        после сохранения. Пустое поле оставляет прежний секрет.
      </p>
      {error && (
        <p role="alert" className="sa-field-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!settings ? (
        <button
          type="button"
          className="sa-button secondary"
          onClick={() => setRetry((value) => value + 1)}
        >
          Обновить настройки
        </button>
      ) : (
        <form className="sa-form" onSubmit={save} autoComplete="off">
          <fieldset disabled={busy}>
            <legend>
              Реквизиты продавца{" "}
              {settings.missing.seller ? "— не заполнены" : ""}
            </legend>
            <label>
              <input
                type="checkbox"
                checked={sellerEnabled}
                onChange={(event) => setSellerEnabled(event.target.checked)}
              />{" "}
              Использовать реквизиты компании
            </label>
            {sellerEnabled &&
              sellerFields.map(([field, label]) => (
                <label className="sa-field" key={field}>
                  {label}
                  <input
                    className="sa-input"
                    value={seller[field]}
                    required={[
                      "name",
                      "inn",
                      "bank_name",
                      "bic",
                      "account",
                      "correspondent_account",
                    ].includes(field)}
                    maxLength={field === "address" ? 1000 : 300}
                    onChange={(event) =>
                      setSeller((value) => ({
                        ...value,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            {!sellerEnabled && settings.seller && (
              <p className="sa-hint">
                После сохранения реквизиты будут удалены.
              </p>
            )}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>
              Собственный бот Telegram{" "}
              {settings.missing.telegram ? "— не настроен" : ""}
            </legend>
            <label className="sa-field">
              Имя бота без @
              <input
                className="sa-input"
                value={settings.telegram.username}
                maxLength={32}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    telegram: {
                      ...settings.telegram,
                      username: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="sa-field">
              Новый токен{" "}
              {settings.telegram.token_configured
                ? "(прежний сохранён)"
                : "(не задан)"}
              <input
                className="sa-input"
                type="password"
                autoComplete="new-password"
                value={token}
                disabled={clearToken}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={clearToken}
                onChange={(event) => {
                  setClearToken(event.target.checked);
                  setToken("");
                }}
              />{" "}
              Удалить сохранённый токен
            </label>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>
              Собственный помощник{" "}
              {settings.missing.assistant ? "— не настроен" : ""}
            </legend>
            <label className="sa-field">
              Провайдер
              <select
                className="sa-input"
                value={settings.assistant.provider}
                onChange={(event) => {
                  setSettings({
                    ...settings,
                    assistant: {
                      ...settings.assistant,
                      provider: event.target
                        .value as ModuleSettings["assistant"]["provider"],
                    },
                  });
                  setKey("");
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="timeweb">Timeweb</option>
              </select>
            </label>
            <p className="sa-hint">
              При смене провайдера прежний ключ удаляется. Введите ключ нового
              провайдера.
            </p>
            <label className="sa-field">
              Модель
              <input
                className="sa-input"
                value={settings.assistant.model}
                required
                maxLength={100}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    assistant: {
                      ...settings.assistant,
                      model: event.target.value,
                    },
                  })
                }
              />
            </label>
            {settings.assistant.provider === "timeweb" && (
              <label className="sa-field">
                ID агента Timeweb
                <input
                  className="sa-input"
                  value={settings.assistant.agent_id || ""}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      assistant: {
                        ...settings.assistant,
                        agent_id: event.target.value || null,
                      },
                    })
                  }
                />
              </label>
            )}
            <label className="sa-field">
              Новый ключ{" "}
              {settings.assistant.key_configured
                ? "(прежний сохранён)"
                : "(не задан)"}
              <input
                className="sa-input"
                type="password"
                autoComplete="new-password"
                value={key}
                disabled={clearKey}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(event) => {
                  setClearKey(event.target.checked);
                  setKey("");
                }}
              />{" "}
              Удалить сохранённый ключ
            </label>
          </fieldset>
          <button
            className="sa-button"
            disabled={busy || settings.company_version !== version}
          >
            {busy ? "Сохраняем…" : "Сохранить настройки модулей"}
          </button>
        </form>
      )}
    </div>
  );
}

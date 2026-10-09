import { useEffect, useState } from "react";
import { api } from "./saasAdminApi";
import type { Company } from "./saasAdminModel";

export type ProvisioningStatus = {
  company_id: string;
  company_version: number;
  state: "not_started" | "pending" | "running" | "failed" | "ready";
  ready: boolean;
  configured: boolean;
  step: string | null;
  updated_at: string | null;
  error_code: string | null;
  steps: { id: string; completed: boolean }[];
  dns_records: { name: string; type: string; value: string }[];
  dns_configured: boolean;
  terminals: { state: string; message: string };
};
const labels: Record<string, string> = {
  migrations: "База и миграции",
  database_roles: "Права базы",
  identity: "Пользователи и вход",
  connections: "Соединения iiko",
  initial_sync: "Начальная загрузка",
  modules: "Модули кабинета",
  payments: "Платёжные терминалы",
  dns_tls: "Домен и HTTPS",
  runtime_health: "Работа сервисов",
};
const states = {
  not_started: "Не запущен",
  pending: "В очереди",
  running: "Выполняется",
  failed: "Требуется повтор",
  ready: "Кабинет готов",
};
const errors: Record<string, string> = {
  acceptance_session_required:
    "Войдите в кабинет клиента из SaaS, затем повторите проверку.",
  acceptance_session_invalid:
    "Вход владельца истёк. Войдите в кабинет клиента и повторите проверку.",
  acceptance_owner_required: "Для проверки нужен вход владельца сервиса.",
  acceptance_password_change_required:
    "Сначала замените временный пароль владельца.",
  module_configuration_required:
    "Не все модули настроены. Проверьте реквизиты, Telegram, помощника и фоновые службы компании.",
  payment_terminal_required: "Добавьте платёжный терминал этой компании.",
  payment_settlement_contract_required:
    "Проверка подтверждения оплаты ещё не завершена.",
};
export default function SaasProvisioning({ company }: { company: Company }) {
  const [status, setStatus] = useState<ProvisioningStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setStatus(null);
    setError("");
    setBusy(false);
    async function load() {
      try {
        const next = await api.provisioning(company.id, controller.signal);
        if (controller.signal.aborted) return;
        setStatus(next);
        setError("");
        if (next.state === "pending" || next.state === "running")
          timer = setTimeout(load, 5000);
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [company.id, company.version, reload]);
  async function start() {
    if (!status || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.startProvisioning(
        company.id,
        company.version,
        status.state === "failed",
      );
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current =
    status?.company_id === company.id &&
    status.company_version === company.version
      ? status
      : null;
  return (
    <section>
      <div className="sa-section-heading">
        <h3>Запуск кабинета</h3>
        <button
          className="sa-text-button"
          onClick={() => setReload((n) => n + 1)}
        >
          Обновить
        </button>
      </div>
      {error && (
        <p className="sa-field-error" role="alert">
          {error}
        </p>
      )}
      {!current ? (
        <p className="sa-hint" role="status">
          Загружаем состояние…
        </p>
      ) : (
        <>
          <p role="status">
            <strong>{states[current.state]}</strong>
          </p>
          {current.updated_at && (
            <p className="sa-hint">
              Последняя проверка:{" "}
              {new Date(current.updated_at).toLocaleString("ru-RU")}
            </p>
          )}
          <ul>
            {current.steps.map((step) => (
              <li key={step.id}>
                {labels[step.id] || step.id}:{" "}
                {step.completed
                  ? "проверено"
                  : current.step === step.id
                    ? current.state === "failed"
                      ? "ошибка проверки"
                      : "проверяется"
                    : "ожидает проверки"}
              </li>
            ))}
          </ul>
          {current.state === "failed" && (
            <p className="sa-field-error">
              Проверка остановилась на этапе «
              {labels[current.step || ""] || "Запуск"}».{" "}
              {errors[current.error_code || ""] ||
                "Подтверждённые этапы сохраняются при повторе."}
            </p>
          )}
          {!current.configured && (
            <p className="sa-hint">Оператор запуска ещё не настроен.</p>
          )}
          <button
            className="sa-button secondary small"
            disabled={
              busy ||
              !current.configured ||
              ["pending", "running", "ready"].includes(current.state)
            }
            onClick={start}
          >
            {busy
              ? "Ставим в очередь…"
              : current.state === "failed"
                ? "Повторить запуск"
                : "Запустить кабинет"}
          </button>
          <h4>DNS</h4>
          {current.dns_records.map((record) => (
            <p className="sa-url" key={record.name}>
              {record.name} · {record.type} · {record.value}
            </p>
          ))}
          {!current.dns_configured && (
            <p className="sa-hint">
              Точные DNS-записи появятся после настройки домена и публичных
              адресов оператора.
            </p>
          )}
          <p className="sa-hint">{current.terminals.message}</p>
        </>
      )}
    </section>
  );
}

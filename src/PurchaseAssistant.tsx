import { useEffect, useRef, useState } from "react";
import { ActionIcon, Button, Select, Textarea } from "@mantine/core";
import { Link } from "react-router-dom";
import {
  IconSparkles,
  IconSend,
  IconMinus,
  IconHistory,
  IconRefresh,
  IconChevronRight,
} from "@tabler/icons-react";
import { api } from "./api";
import "./purchase-assistant.css";

export type AssistantSelection = {
  product_id: string;
  unit_id: string;
  linked: boolean;
};
export type AssistantContext = {
  product: AssistantSelection | null;
  kind: string;
  exclude_household: boolean;
  recent_only: boolean;
};
export type AssistantSource = {
  kind: "invoice" | "history" | "impact";
  label: string;
  href?: string;
  selection?: AssistantSelection;
};
type Turn = {
  id: string;
  question: string;
  answer: string;
  sources: AssistantSource[];
};
type Chat = { id: string; context: AssistantContext; turns: Turn[] };
type Status = {
  configured: boolean;
  provider: string;
  requests_per_hour: number;
};

export function PurchaseAssistant({
  context,
  productName,
  onClose,
  onSource,
  active,
  onNavigate,
  sourceError,
  sourceLoading,
}: {
  context: AssistantContext;
  productName: string | null;
  onClose: () => void;
  active: boolean;
  onNavigate: () => void;
  sourceError: string;
  sourceLoading: boolean;
  onSource: (source: AssistantSource) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [conversations, setConversations] = useState<
    { id: string; title: string }[]
  >([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadingChat, setLoadingChat] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const messages = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<Status>("/assistant/status", { signal: abort.signal }),
      api<{ id: string; title: string }[]>("/assistant/conversations", {
        signal: abort.signal,
      }),
    ])
      .then(([config, history]) => {
        setStatus(config);
        setConversations(history);
      })
      .catch((e: unknown) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Не удалось открыть помощника.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [reload]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (active && messages.current)
      messages.current.scrollTop =
        chat?.turns.length || pending || error
          ? messages.current.scrollHeight
          : 0;
  }, [chat, pending, error, active]);

  async function loadChat(id: string | null) {
    if (!id) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoadingChat(true);
    setError("");
    try {
      const result = await api<Chat>("/assistant/conversations/" + id, {
        signal: abort.signal,
      });
      setChat(result);
      setShowHistory(false);
      setQuestion("");
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Не удалось открыть диалог.");
    } finally {
      if (!abort.signal.aborted) setLoadingChat(false);
    }
  }
  async function send(text: string) {
    text = text.trim();
    if (!text || pending || !status?.configured || loadingChat) return;
    const abort = new AbortController();
    controller.current = abort;
    setPending(text);
    setError("");
    try {
      const result = await api<Chat>("/assistant/messages", {
        method: "POST",
        signal: abort.signal,
        body: JSON.stringify({
          question: text,
          request_id: crypto.randomUUID(),
          conversation_id: chat?.id ?? null,
          context: chat?.context ?? context,
        }),
      });
      setChat(result);
      setQuestion("");
      setConversations((old) =>
        old.some((c) => c.id === result.id)
          ? old
          : [{ id: result.id, title: text.slice(0, 120) }, ...old].slice(0, 20),
      );
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : "Не удалось получить ответ.");
        setQuestion(text);
      }
    } finally {
      if (!abort.signal.aborted) setPending("");
    }
  }
  const suggestions = (chat?.context ?? context).product
    ? [
        "Объясни изменение цены этого товара",
        "На какие блюда и затраты за неделю это влияет?",
        "Покажи последние поступления и среднюю цену",
      ]
    : [
        "Какие товары сильнее всего подорожали?",
        "У каких товаров наибольший рост затрат за неделю?",
        "Найди мясо бедро куриное",
      ];
  return (
    <div className="assistant-card">
      <header className="assistant-header">
        <div className="assistant-heading">
          <span className="assistant-avatar">
            <IconSparkles size={17} />
          </span>
          <div>
            <h2>ИИ-ассистент</h2>
            <span>Помощник по закупкам</span>
          </div>
        </div>
        <div className="assistant-header-actions">
          <ActionIcon
            size="md"
            variant="subtle"
            aria-label="История диалогов"
            title="История диалогов"
            aria-expanded={showHistory}
            aria-controls="assistant-history"
            disabled={!!pending || loadingChat}
            onClick={() => setShowHistory((v) => !v)}
          >
            <IconHistory size={18} />
          </ActionIcon>
          <ActionIcon
            size="md"
            variant="subtle"
            aria-label="Новый диалог"
            title="Новый диалог"
            disabled={!!pending || loadingChat}
            onClick={() => {
              setChat(null);
              setQuestion("");
              setError("");
              setShowHistory(false);
            }}
          >
            <IconRefresh size={18} />
          </ActionIcon>
          <ActionIcon
            size="md"
            variant="subtle"
            aria-label="Свернуть чат"
            title="Свернуть чат"
            onClick={onClose}
          >
            <IconMinus size={18} />
          </ActionIcon>
        </div>
      </header>
      <div className="assistant-context">
        <span className="assistant-scope-dot" />
        {chat
          ? "Контекст выбранного диалога"
          : (productName ?? "Вся доступная сеть")}
      </div>
      {showHistory && (
        <div id="assistant-history" className="assistant-history">
          {conversations.length > 0 ? (
            <Select
              label="Мои диалоги"
              placeholder="Выберите диалог"
              value={chat?.id ?? null}
              disabled={!!pending || loadingChat}
              comboboxProps={{ withinPortal: false }}
              data={conversations.map((c) => ({ value: c.id, label: c.title }))}
              onChange={(id) => void loadChat(id)}
            />
          ) : (
            <p className="muted">Здесь появятся ваши сохранённые диалоги.</p>
          )}
        </div>
      )}
      <div
        className="assistant-messages"
        ref={messages}
        role="log"
        aria-label="Диалог с помощником"
        aria-live="polite"
        aria-busy={!!pending || loadingChat}
      >
        {!chat?.turns.length && !pending && (
          <div className="assistant-welcome">
            <span className="assistant-welcome-symbol">
              <IconSparkles size={24} />
            </span>
            <h3>Привет! Давай разберёмся в закупках.</h3>
            <p>Помогу понять, что изменилось и на какие блюда это влияет.</p>
            <ul>
              <li>Найти товары, которые подорожали</li>
              <li>Сравнить последние поступления</li>
              <li>Оценить изменение затрат за неделю</li>
            </ul>
          </div>
        )}
        {chat?.turns.map((turn) => (
          <div key={turn.id} className="assistant-turn">
            <div className="assistant-question">
              <strong>Вы</strong>
              <p>{turn.question}</p>
            </div>
            <div className="assistant-answer">
              <strong>
                <IconSparkles size={13} /> Помощник
              </strong>
              <p>{turn.answer}</p>
              {turn.sources.length > 0 && (
                <details className="assistant-sources">
                  <summary>Источники · {turn.sources.length}</summary>
                  <div>
                    {turn.sources.map((source, index) =>
                      source.kind === "invoice" &&
                      source.href?.startsWith("/invoices/") ? (
                        <Link key={index} to={source.href} onClick={onNavigate}>
                          {source.label}
                          <IconChevronRight size={13} />
                        </Link>
                      ) : (
                        <Button
                          key={index}
                          variant="subtle"
                          size="xs"
                          disabled={sourceLoading}
                          onClick={() => onSource(source)}
                        >
                          {source.label}
                          <IconChevronRight size={13} />
                        </Button>
                      ),
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <>
            <div className="assistant-question">
              <strong>Вы</strong>
              <p>{pending}</p>
            </div>
            <div className="assistant-thinking" role="status">
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Смотрю данные и расчёты…
            </div>
          </>
        )}
        {(loading || loadingChat) && (
          <p className="assistant-loading" role="status">
            {loadingChat ? "Открываю диалог…" : "Подключаю помощника…"}
          </p>
        )}
        {sourceLoading && <p role="status">Открываю источник…</p>}
        {(error || sourceError) && (
          <div className="assistant-error" role="alert">
            {error || sourceError}
            {!status && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setReload((n) => n + 1)}
              >
                Повторить
              </Button>
            )}
          </div>
        )}
        {!chat?.turns.length && !pending && !loadingChat && (
          <div className="assistant-suggestions">
            {suggestions.map((s) => (
              <Button
                variant="default"
                size="xs"
                key={s}
                disabled={!status?.configured || loading}
                rightSection={<IconChevronRight size={14} />}
                onClick={() => void send(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
        {!loading && status && !status.configured && (
          <div className="assistant-notice" role="status">
            <span>Помощник пока не подключён.</span>
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={() => setReload((n) => n + 1)}
            >
              Проверить подключение
            </Button>
          </div>
        )}
      </div>
      <div className="assistant-composer">
        <form
          className="assistant-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send(question);
          }}
        >
          <Textarea
            aria-label="Ваш вопрос"
            placeholder="Напишите ваш вопрос…"
            autosize
            minRows={1}
            maxRows={4}
            maxLength={2000}
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            disabled={!!pending || loadingChat}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send(question);
              }
            }}
          />
          <ActionIcon
            type="submit"
            size={40}
            radius="md"
            aria-label="Отправить"
            title="Отправить"
            loading={!!pending}
            disabled={
              !status?.configured || !question.trim() || loadingChat || loading
            }
          >
            <IconSend size={19} />
          </ActionIcon>
        </form>
        <p className="assistant-footnote">
          ИИ может ошибаться. Проверяйте важные цифры по источникам.
        </p>
        <details className="assistant-about">
          <summary>О помощнике</summary>
          <p>
            Вопрос и выборка для ответа передаются{" "}
            {status?.provider === "openrouter"
              ? "OpenRouter и выбранной модели"
              : "провайдеру ИИ"}
            .{status && ` Лимит: ${status.requests_per_hour} запросов в час.`}{" "}
            Оценка за неделю — сценарий затрат.
          </p>
        </details>
      </div>
    </div>
  );
}

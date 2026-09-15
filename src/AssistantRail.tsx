import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button, FocusTrap } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconMessageCircle } from "@tabler/icons-react";
import { api } from "./api";
import { useAssistant } from "./AssistantContext";
import { PurchaseAssistant, type AssistantSource } from "./PurchaseAssistant";
import { PriceDetails, type PriceChange } from "./PurchasePrices";
import { PurchaseImpact } from "./PurchaseImpact";
import { PurchaseModal } from "./PurchaseModal";

export function AssistantToggle() {
  const assistant = useAssistant();
  return (
    <Button
      variant="light"
      size="xs"
      leftSection={<IconMessageCircle size={17} />}
      className="site-assistant-toggle"
      aria-controls="site-assistant"
      aria-expanded={assistant.opened}
      onClick={() => assistant.open()}
    >
      ИИ-ассистент
    </Button>
  );
}

export function AssistantRail() {
  const assistant = useAssistant();
  const compact = useMediaQuery("(max-width: 1299px)");
  const [preview, setPreview] = useState<{
    kind: string;
    row: PriceChange;
  } | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const rail = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
    setSourceError("");
    setSourceLoading(false);
    setPreview(null);
  }, [assistant.request.revision]);
  useEffect(() => {
    if (!assistant.opened) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      const prior = previousFocus.current;
      if (
        prior?.isConnected &&
        prior.matches("a,button,input,textarea,select,[tabindex]") &&
        !rail.current?.contains(prior)
      )
        prior.focus({ preventScroll: true });
      else trigger.current?.focus({ preventScroll: true });
    };
  }, [assistant.opened]);
  useEffect(() => {
    if (assistant.opened && assistant.focusRevision > 0) {
      rail.current
        ?.querySelector<HTMLTextAreaElement>("textarea")
        ?.focus({ preventScroll: true });
    }
  }, [assistant.opened, assistant.focusRevision]);
  useEffect(() => {
    if (!compact || !assistant.opened) return;
    const saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = saved;
    };
  }, [compact, assistant.opened]);

  async function openSource(source: AssistantSource) {
    if (!source.selection) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setSourceError("");
    setSourceLoading(true);
    try {
      const params = new URLSearchParams({
        product_id: source.selection.product_id,
        unit_id: source.selection.unit_id,
        linked: String(source.selection.linked),
      });
      const row = await api<PriceChange>("/purchase-prices/history?" + params, {
        signal: abort.signal,
      });
      setPreview({ kind: source.kind, row });
    } catch (error) {
      if (!abort.signal.aborted)
        setSourceError(
          error instanceof Error
            ? error.message
            : "Не удалось открыть источник.",
        );
    } finally {
      if (!abort.signal.aborted) setSourceLoading(false);
    }
  }
  return (
    <>
      {!assistant.opened && (
        <Button
          ref={trigger}
          className="assistant-floating"
          radius="xl"
          leftSection={<IconMessageCircle size={20} />}
          onClick={() => assistant.open()}
          aria-controls="site-assistant"
          aria-expanded={false}
        >
          Чат с ИИ
        </Button>
      )}
      {compact && assistant.opened && (
        <div
          className="assistant-backdrop"
          aria-hidden="true"
          onClick={assistant.close}
        />
      )}
      <FocusTrap active={!!compact && assistant.opened && !preview}>
        <aside
          ref={rail}
          id="site-assistant"
          className="assistant-rail"
          hidden={!assistant.opened}
          role={compact ? "dialog" : "complementary"}
          aria-modal={compact && assistant.opened ? true : undefined}
          aria-label="ИИ-ассистент"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !preview && !event.defaultPrevented) {
              event.stopPropagation();
              assistant.close();
            }
          }}
        >
          {assistant.mounted && (
            <PurchaseAssistant
              key={assistant.request.revision}
              context={assistant.request.context}
              productName={assistant.request.productName}
              onClose={assistant.close}
              active={assistant.opened}
              onNavigate={() => {
                if (compact) assistant.close();
              }}
              onSource={(source) => void openSource(source)}
              sourceError={sourceError}
              sourceLoading={sourceLoading}
            />
          )}
        </aside>
      </FocusTrap>
      <PurchaseModal
        opened={!!preview}
        onClose={() => setPreview(null)}
        size={preview?.kind === "impact" ? "70rem" : "xl"}
        closeButtonProps={{ "aria-label": "Закрыть источник помощника" }}
        title={
          preview
            ? (preview.kind === "impact"
                ? "Блюда и влияние цены · "
                : "Динамика цены · ") + preview.row.product
            : "Источник"
        }
      >
        {preview?.kind === "impact" ? (
          <PurchaseImpact row={preview.row} scope="" />
        ) : (
          preview && <PriceDetails row={preview.row} scope="" />
        )}
      </PurchaseModal>
    </>
  );
}

export function AssistantLayout({ children }: { children: ReactNode }) {
  const { opened } = useAssistant();
  const overview = useLocation().pathname === "/";
  return (
    <div
      className={
        "workspace-body" +
        (opened ? " with-assistant" : "") +
        (overview ? " overview-layout" : "")
      }
    >
      {children}
      <div className="workspace-right">
        <div id="overview-notifications" />
        <AssistantRail />
      </div>
    </div>
  );
}

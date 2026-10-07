import { useEffect, useId, useRef, type ReactNode } from "react";
import { ActionIcon, Modal } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconX } from "@tabler/icons-react";

export function DocumentPanel({
  title,
  close,
  busy = false,
  mobileInline = false,
  children,
}: {
  title: string;
  close: () => void;
  busy?: boolean;
  mobileInline?: boolean;
  children: ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 64em)", false, {
    getInitialValueInEffect: false,
  });
  const heading = useId();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!desktop && !mobileInline) return;
    const previous = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    if (!desktop) panel.current?.scrollIntoView({ block: "start" });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [desktop, mobileInline]);
  if (!desktop && !mobileInline)
    return (
      <Modal
        opened
        fullScreen
        title={title}
        onClose={close}
        closeOnClickOutside={false}
        closeOnEscape={!busy}
        withCloseButton={!busy}
        closeButtonProps={{ "aria-label": "Закрыть документ" }}
        removeScrollProps={{ allowPinchZoom: true }}
      >
        {children}
      </Modal>
    );
  return (
    <aside
      className={`document-panel${mobileInline ? " document-panel-mobile-inline" : ""}`}
      aria-labelledby={heading}
      ref={panel}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented && !busy) close();
      }}
    >
      <header className="document-panel-header">
        <h2 id={heading}>{title}</h2>
        <ActionIcon
          aria-label="Закрыть документ"
          variant="subtle"
          onClick={close}
          disabled={busy}
        >
          <IconX size={20} />
        </ActionIcon>
      </header>
      <div className="document-panel-body">{children}</div>
    </aside>
  );
}

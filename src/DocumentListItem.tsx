import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Badge, Group, Text } from "@mantine/core";
import { dateText } from "./api";
import { useDocumentCache } from "./DocumentData";
import {
  documentStatuses,
  submissionLabel,
  type DocumentKind,
  type DocumentRecord,
} from "./documentModel";

export function DocumentListItem({
  kind,
  doc,
  selected,
}: {
  kind: DocumentKind;
  doc: DocumentRecord;
  selected: boolean;
}) {
  const cache = useDocumentCache();
  const link = useRef<HTMLAnchorElement>(null);
  const path = `/documents/${kind}/${doc.id}`;
  const prefetch = useCallback(() => cache.prefetch(path), [cache, path]);
  useEffect(() => {
    const previous = cache.get<DocumentRecord>(path).data;
    if (
      previous &&
      (previous.version !== doc.version ||
        previous.status !== doc.status ||
        previous.submission_state !== doc.submission_state)
    )
      cache.invalidate(path, true);
    if (!link.current || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          prefetch();
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(link.current);
    return () => observer.disconnect();
  }, [cache, path, prefetch, doc.version, doc.status, doc.submission_state]);
  return (
    <Link
      ref={link}
      className={`management-card document-list-card${selected ? " selected" : ""}`}
      to={`/${kind === "waybill" ? "transfers" : "writeoffs"}/documents/${doc.id}`}
      aria-current={selected ? "page" : undefined}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text className="document-number" fw={600}>
            {doc.number}
          </Text>
          <Text fw={500}>
            {doc.store}
            {kind === "waybill" && ` → ${doc.counteragent}`}
          </Text>
          <Text size="sm" c="dimmed">
            {dateText(doc.created_at)} · {doc.created_by}
          </Text>
          {doc.reason && <Text size="sm">{doc.reason}</Text>}
          {["queued", "sending", "unknown", "rejected"].includes(
            doc.submission_state,
          ) && (
            <Text c="orange" size="sm">
              {submissionLabel(doc.submission_state)}
            </Text>
          )}
        </div>
        <Badge size="sm">
          {doc.submission_state === "queued"
            ? "Согласован · в очереди"
            : doc.submission_state === "sending"
              ? "Отправляется"
              : documentStatuses[doc.status] || doc.status}
        </Badge>
      </Group>
    </Link>
  );
}

import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Badge, Group, Text } from "@mantine/core";
import { dateText } from "./api";
import { useDocumentCache, useDocumentSnapshot } from "./DocumentData";
import { WriteoffReconciliation } from "./WriteoffReconciliation";
import {
  writeoffListCostText,
  writeoffListEstimate,
} from "./writeoffCostModel";
import {
  documentWorkflowLabel,
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
  const detail = useDocumentSnapshot<DocumentRecord>(
    kind === "writeoff" ? path : null,
  );
  const prefetch = useCallback(() => cache.prefetch(path), [cache, path]);
  const checkedAt = doc.iiko_reconciliation?.checked_at;
  useEffect(() => {
    const previous = cache.get<DocumentRecord>(path).data;
    if (
      previous &&
      (previous.version !== doc.version ||
        previous.status !== doc.status ||
        previous.submission_state !== doc.submission_state ||
        (checkedAt &&
          (!previous.iiko_reconciliation?.checked_at ||
            Date.parse(checkedAt) >
              Date.parse(previous.iiko_reconciliation.checked_at))))
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
  }, [
    cache,
    path,
    prefetch,
    doc.version,
    doc.status,
    doc.submission_state,
    checkedAt,
  ]);
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
          {kind === "writeoff" && (
            <Text size="sm" fw={600}>
              {writeoffListCostText(writeoffListEstimate(doc, detail))}
            </Text>
          )}
          {kind === "writeoff" && <WriteoffReconciliation doc={doc} compact />}
          {!(doc.iiko_reconciliation && doc.submission_state === "unknown") &&
            ["queued", "sending", "unknown", "rejected"].includes(
              doc.submission_state,
            ) && (
              <Text c="orange" size="sm">
                {submissionLabel(doc.submission_state)}
              </Text>
            )}
        </div>
        <Badge size="sm">{documentWorkflowLabel(doc)}</Badge>
      </Group>
    </Link>
  );
}

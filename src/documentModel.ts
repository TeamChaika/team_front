export type DocumentKind = "waybill" | "writeoff";
export type WriteoffCostItem = {
  product_id: string;
  amount: number | string;
  unit_cost: string | null;
  sum: string | null;
  reason: string | null;
};
export type WriteoffCostEstimate = {
  source: "store_balance";
  source_at: string | null;
  estimated_at: string;
  items?: WriteoffCostItem[];
  total: string | null;
  known_total: string;
  unpriced_count: number;
};
export type DocumentItem = {
  product_id: string;
  name?: string;
  amount: number | string;
  received_amount?: number | null;
};
export type ReceiptItem = { product_id: string; amount: number | string };
export type WriteoffReconciliation = {
  state: "matched" | "not_found" | "ambiguous";
  iiko_status: "NEW" | "PROCESSED" | "DELETED" | null;
  checked_at: string;
  expected_date: string | null;
  actual_date: string | null;
  date_differs: boolean;
  quantity_difference_count: number;
  quantity_differences?: {
    product_id: string;
    name: string | null;
    expected_amount: string | number | null;
    actual_amount: string | number | null;
  }[];
};
export type DocumentDraft = {
  store_id: string;
  counteragent_id?: string;
  reason?: string;
  reason_id?: number;
  comment: string;
  items: DocumentItem[];
};
export type DocumentRecord = DocumentDraft & {
  kind: DocumentKind;
  id: number;
  number: string;
  version: number;
  status: string;
  submission_state: string;
  receipt_state?: "none" | "pending_sender" | "accepted" | "rejected";
  store: string;
  counteragent?: string;
  created_by: string;
  created_at: string;
  processed_by?: string;
  processed_at?: string;
  actions?: string[];
  iiko_reconciliation?: WriteoffReconciliation | null;
  cost_estimate?: WriteoffCostEstimate | null;
  history?: {
    action: string;
    version: number;
    actor: string;
    created_at: string;
    data?: { items?: (DocumentItem & { received_amount?: number | null })[] };
  }[];
};
export type DocumentOptions = {
  stores: { id: string; name: string }[];
  recipients: { id: string; name: string }[];
  create_stores?: { id: string; name: string }[];
  create_recipients?: { id: string; name: string }[];
  reasons: { id: number; name: string }[];
  grants: { store_id: string; actions: string[] }[];
};
export const documentStatuses: Record<string, string> = {
  Created: "На согласовании",
  Sent: "Отправлен в iiko",
  Denied: "Отклонён",
  Cancelled: "Отменён",
};
export const receiptStatuses: Record<string, string> = {
  pending_sender: "Расхождение ожидает отправителя",
  accepted: "Расхождение подтверждено",
  rejected: "Расхождение отклонено",
};
export function documentWorkflowLabel(doc: DocumentRecord) {
  if (doc.receipt_state === "pending_sender")
    return receiptStatuses.pending_sender;
  if (doc.submission_state === "queued") return "Согласован · в очереди";
  if (doc.submission_state === "sending") return "Отправляется";
  if (doc.receipt_state === "rejected") return receiptStatuses.rejected;
  if (
    doc.kind === "writeoff" &&
    doc.status === "Created" &&
    doc.submission_state === "unknown"
  )
    return "Согласован";
  return documentStatuses[doc.status] || doc.status;
}

export function writeoffReconciliationLabel(
  doc: DocumentRecord,
): string | null {
  const result = doc.iiko_reconciliation;
  if (doc.kind !== "writeoff" || result === undefined) return null;
  if (result === null)
    return ["unknown", "sent"].includes(doc.submission_state) ||
      doc.status === "Sent"
      ? "Ещё не проверен"
      : null;
  if (result.state === "not_found") return "Акт не найден при сверке";
  if (result.state === "ambiguous") return "Найдено несколько актов";
  return result.iiko_status
    ? iikoDocumentStatuses[result.iiko_status] || "Статус неизвестен"
    : "Статус неизвестен";
}

export const iikoDocumentStatuses = {
  NEW: "Новый",
  PROCESSED: "Проведён",
  DELETED: "Удалён",
};

const quantityFormat = new Intl.NumberFormat("ru-RU", {
  maximumSignificantDigits: 17,
});
export function reconciledQuantity(amount: string | number | null) {
  if (amount === null) return "Нет позиции";
  if (typeof amount === "number") return quantityFormat.format(amount);
  // iiko quantities arrive as fixed-point decimal strings with arbitrary scale.
  const [integer, fraction = ""] = amount.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const digits = fraction.replace(/0+$/, "");
  return digits ? `${grouped},${digits}` : grouped;
}
export function receiptSnapshot(
  doc: Pick<DocumentRecord, "id" | "version" | "items">,
) {
  return {
    id: doc.id,
    version: doc.version,
    items: doc.items.map((item) => ({ ...item })),
  };
}
export function actionSnapshot(
  doc: Pick<DocumentRecord, "id" | "number" | "version" | "receipt_state">,
  action: string,
) {
  return {
    action,
    id: doc.id,
    number: doc.number,
    version: doc.version,
    receipt_state: doc.receipt_state,
  };
}
export function receiptDifference(
  original: number | string,
  received: number | string | null | undefined,
) {
  if (received == null) return "—";
  const difference = Number(received) - Number(original);
  return String(Number(difference.toPrecision(12)));
}
export function receiptPayload(
  original: DocumentItem[],
  actual: ReceiptItem[],
  requestId: string,
  version: number,
) {
  if (actual.length !== original.length)
    throw new Error("Укажите фактическое количество для каждой позиции.");
  const expected = new Map(
    original.map((row) => [row.product_id, Number(row.amount)]),
  );
  const seen = new Set<string>();
  let positive = false;
  let changed = false;
  const items = actual.map((row) => {
    const raw = String(row.amount).trim();
    const amount = Number(raw.replace(",", "."));
    if (!expected.has(row.product_id) || seen.has(row.product_id))
      throw new Error("Состав позиций при приёмке изменён. Обновите карточку.");
    if (!raw || !Number.isFinite(amount) || amount < 0 || amount > 1e9)
      throw new Error("Укажите количество от 0 до 1 млрд для каждой позиции.");
    seen.add(row.product_id);
    positive ||= amount > 0;
    changed ||= amount !== expected.get(row.product_id);
    return { product_id: row.product_id, amount };
  });
  if (!positive)
    throw new Error(
      "Нельзя принять документ с нулевым количеством по всем позициям.",
    );
  if (!changed)
    throw new Error("Расхождений нет. Используйте кнопку «Согласовать».");
  return { request_id: requestId, version, items };
}
export function submissionLabel(value: string) {
  return (
    (
      {
        idle: "Не отправлен",
        queued: "В очереди — отправим автоматически при наличии связи с iiko",
        sending: "Отправляется — повтор заблокирован",
        unknown: "Результат отправки требует проверки",
        rejected: "iiko отклонил документ",
        sent: "iiko принял документ",
      } as Record<string, string>
    )[value] || value
  );
}
export function documentPayload(
  kind: DocumentKind,
  value: DocumentDraft,
  requestId: string,
  version?: number,
) {
  if (!value.store_id) throw new Error("Выберите склад.");
  if (
    kind === "waybill" &&
    (!value.counteragent_id || value.counteragent_id === value.store_id)
  )
    throw new Error("Выберите другой склад получателя.");
  if (kind === "writeoff" && (!value.reason || !value.reason_id))
    throw new Error("Выберите причину списания.");
  if (value.comment.length > 1000)
    throw new Error("Комментарий: не более 1000 символов.");
  if (!value.items.length || value.items.length > 200)
    throw new Error("Добавьте от 1 до 200 позиций.");
  const seen = new Set<string>();
  const items = value.items.map((row) => {
    const amount = Number(String(row.amount).replace(",", "."));
    if (
      !row.product_id ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1e9
    )
      throw new Error(
        "Для каждой позиции выберите товар и положительное количество до 1 млрд.",
      );
    if (seen.has(row.product_id))
      throw new Error("Один товар нельзя добавить дважды.");
    seen.add(row.product_id);
    return { product_id: row.product_id, amount };
  });
  return {
    request_id: requestId,
    ...(version === undefined ? {} : { version }),
    store_id: value.store_id,
    comment: value.comment,
    items,
    ...(kind === "waybill"
      ? { counteragent_id: value.counteragent_id }
      : { reason: value.reason, reason_id: value.reason_id }),
  };
}

export function documentEditorCatalogs(
  options: DocumentOptions,
  mode: "create" | "edit" | "copy",
) {
  const action = mode === "edit" ? "edit" : "create";
  return {
    stores: (mode === "edit"
      ? options.stores
      : (options.create_stores ?? options.stores)
    ).filter((s) =>
      options.grants.some(
        (g) => g.store_id === s.id && g.actions.includes(action),
      ),
    ),
    recipients:
      mode === "edit"
        ? options.recipients
        : (options.create_recipients ?? options.recipients),
  };
}
export function copyDocumentStores(
  options: DocumentOptions,
  draft: Pick<DocumentDraft, "store_id" | "counteragent_id">,
) {
  const catalog = documentEditorCatalogs(options, "copy");
  const store_id = catalog.stores.some((s) => s.id === draft.store_id)
    ? draft.store_id
    : "";
  const counteragent_id = catalog.recipients.some(
    (s) => s.id === draft.counteragent_id && s.id !== store_id,
  )
    ? draft.counteragent_id
    : "";
  return { store_id, counteragent_id };
}

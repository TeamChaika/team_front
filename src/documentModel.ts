export type DocumentKind = "waybill" | "writeoff";
export type DocumentItem = {
  product_id: string;
  name?: string;
  amount: number | string;
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
  store: string;
  counteragent?: string;
  created_by: string;
  created_at: string;
  processed_by?: string;
  processed_at?: string;
  actions?: string[];
  history?: {
    action: string;
    version: number;
    actor: string;
    created_at: string;
  }[];
};
export type DocumentOptions = {
  stores: { id: string; name: string }[];
  recipients: { id: string; name: string }[];
  reasons: { id: number; name: string }[];
  grants: { store_id: string; actions: string[] }[];
};
export const documentStatuses: Record<string, string> = {
  Created: "На согласовании",
  Sent: "Отправлен в iiko",
  Denied: "Отклонён",
  Cancelled: "Отменён",
};
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

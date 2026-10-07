export type CommercialKind = "purchase" | "sale";
export type CommercialItem = {
  product_id: string;
  name?: string;
  unit?: string;
  quantity: string | number;
  price: string | number;
  vat_rate: string | null;
  price_includes_vat: boolean;
  net?: string;
  vat?: string;
  total?: string;
};
export type CommercialDraft = {
  store_id: string;
  counterparty_id: string;
  date: string;
  external_number: string;
  comment: string;
  items: CommercialItem[];
};
export type CommercialParty = {
  id: string;
  name: string;
  inn?: string;
  kpp?: string;
  address?: string;
};
export type CommercialDocument = CommercialDraft & {
  id: string;
  kind: CommercialKind;
  number: string;
  version: number;
  state: string;
  store: string;
  counterparty: CommercialParty;
  seller: { name: string };
  totals: { net: string; vat: string; total: string };
  can_edit: boolean;
  can_submit: boolean;
  can_pdf: boolean;
  history?: {
    action: string;
    version: number;
    actor_id: number | null;
    actor_name: string;
    created_at: string;
  }[];
};
export type CommercialOptions = {
  stores: {
    id: string;
    name: string;
    can_create: boolean;
    can_edit: boolean;
    can_submit: boolean;
  }[];
  can_create: boolean;
  can_submit: boolean;
  submit_enabled: boolean;
  vat_rates: string[];
  seller: { name: string };
};
export const commercialStatuses: Record<string, string> = {
  draft: "Черновик",
  queued: "В очереди отправки",
  sending: "Отправляется в iiko",
  accepted: "Принята iiko",
  processed: "Проведена в iiko",
  rejected: "Отклонена iiko",
  unknown: "Результат отправки требует проверки",
};
function decimal(
  value: string | number,
  label: string,
  positive: boolean,
  precision: number,
) {
  const text = String(value).trim().replace(",", ".");
  if (
    !new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(text) ||
    !Number.isFinite(Number(text)) ||
    Number(text) > 1e9 ||
    (positive && Number(text) <= 0)
  )
    throw new Error(
      `Проверьте ${label}: ${positive ? "нужно положительное число" : "нужно неотрицательное число"}.`,
    );
  return text;
}
export function commercialPayload(
  value: CommercialDraft,
  request_id: string,
  version?: number,
  kind?: CommercialKind,
) {
  if (!value.store_id || !value.counterparty_id)
    throw new Error("Выберите склад и контрагента.");
  const parsedDate = new Date(value.date);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== value.date
  )
    throw new Error("Укажите корректную дату.");
  if (!value.items.length || value.items.length > 200)
    throw new Error("Добавьте от 1 до 200 позиций.");
  if (kind === "purchase" && !value.external_number.trim())
    throw new Error("Укажите номер накладной поставщика.");
  if (value.comment.length > 1000 || value.external_number.length > 100)
    throw new Error("Сократите комментарий или номер накладной.");
  const products = new Set<string>();
  const items = value.items.map((item) => {
    if (!item.product_id || products.has(item.product_id))
      throw new Error("Выберите товар; каждый товар добавляется один раз.");
    products.add(item.product_id);
    if (
      item.vat_rate !== null &&
      !["0", "5", "7", "10", "20", "22"].includes(item.vat_rate)
    )
      throw new Error("Проверьте ставку НДС.");
    return {
      product_id: item.product_id,
      quantity: decimal(item.quantity, "количество", true, 3),
      price: decimal(item.price, "цену", false, 4),
      vat_rate: item.vat_rate,
      price_includes_vat: item.price_includes_vat,
    };
  });
  return {
    request_id,
    ...(version === undefined ? {} : { version }),
    store_id: value.store_id,
    counterparty_id: value.counterparty_id,
    date: value.date,
    external_number: value.external_number.trim(),
    comment: value.comment.trim(),
    items,
  };
}
export function commercialCommand(
  document: Pick<CommercialDocument, "version">,
  request_id: string,
) {
  return { request_id, version: document.version };
}
export function commercialUncertain(error: unknown) {
  return !(
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

export function commercialPartyLabel(party: CommercialParty) {
  return party.inn ? `${party.name} · ИНН ${party.inn}` : party.name;
}
export function commercialHistoryLabel(action: string) {
  if (action === "create") return "Создан черновик";
  if (action === "edit") return "Изменён черновик";
  if (action === "submit") return "Отправлена в очередь iiko";
  if (action.startsWith("iiko_"))
    return commercialStatuses[action.slice(5)] || action;
  return action;
}

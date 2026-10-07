import type { CommercialParty } from "./commercialInvoiceModel";

export type CounterpartyDraft = {
  entity_type: "organization" | "ip" | "person";
  name: string;
  inn: string;
  kpp: string;
  address: string;
  phone: string;
  email: string;
};
export type CounterpartyOperation = {
  id: string;
  state:
    | "queued"
    | "connecting"
    | "sending"
    | "confirmed"
    | "rejected"
    | "unknown";
  counterparty?: CommercialParty;
  error?: string;
  error_code?: string;
  candidates?: CommercialParty[];
};
export const counterpartyPending = (state: CounterpartyOperation["state"]) =>
  ["queued", "connecting", "sending", "unknown"].includes(state);

export function counterpartyPayload(
  draft: CounterpartyDraft,
  request_id: string,
) {
  const value = Object.fromEntries(
    Object.entries(draft).map(([key, text]) => [key, text.trim()]),
  ) as CounterpartyDraft;
  if (!value.name) throw new Error("Укажите название или ФИО.");
  const requiredInn = value.entity_type !== "person";
  const innLength = value.entity_type === "organization" ? 10 : 12;
  if (
    (requiredInn || value.inn) &&
    !new RegExp(`^\\d{${innLength}}$`).test(value.inn)
  )
    throw new Error(`ИНН должен содержать ${innLength} цифр.`);
  if (value.entity_type !== "organization") value.kpp = "";
  if (value.kpp && !/^\d{9}$/.test(value.kpp))
    throw new Error("КПП должен содержать 9 цифр.");
  return { ...value, request_id };
}

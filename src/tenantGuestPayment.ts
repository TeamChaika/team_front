export type GuestDepositRoute = { depositId: string; token: string };
export function parseGuestDepositRoute(
  path: string,
  search: string,
): GuestDepositRoute | null {
  const match =
    /^\/deposit\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(
      path,
    );
  const params = new URLSearchParams(search);
  const tokens = params.getAll("token");
  if (
    !match ||
    tokens.length !== 1 ||
    !/^[A-Za-z0-9_-]{32,512}$/.test(tokens[0])
  )
    return null;
  return { depositId: match[1], token: tokens[0] };
}
export function safePaymentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function depositGuestLink(
  id: string,
  guestUrl: unknown,
  tenant: boolean,
  origin: string,
): string | null {
  const safe = safePaymentUrl(guestUrl);
  if (safe && (!tenant || new URL(safe).origin === origin)) return safe;
  if (tenant || guestUrl) return null;
  return `https://pay.chaika.team/deposit/${encodeURIComponent(id)}`;
}
export type GuestDeposit = {
  id: string;
  venue_id: string;
  restaurant: string;
  amount: number;
  amount_minor: number;
  currency: string;
  status: string;
  paid_at: string | null;
  reservation_date: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  payment: {
    state: string;
    mode: "sandbox" | "live";
    payment_url: string | null;
    qr_image: string | null;
    diagnostic: string | null;
    valid_until: string | null;
  } | null;
};
export async function guestDepositRequest(
  apiOrigin: string,
  route: GuestDepositRoute,
  action?: "prepare" | "reconcile",
  requestId?: string,
  signal?: AbortSignal,
): Promise<GuestDeposit> {
  const origin = new URL(apiOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== apiOrigin ||
    origin.username ||
    origin.password
  )
    throw new Error("Неверный адрес оплаты компании.");
  const path = `${apiOrigin}/api/guest-deposits/${encodeURIComponent(route.depositId)}`;
  const response = await fetch(
    action
      ? `${path}/${action}`
      : `${path}?token=${encodeURIComponent(route.token)}`,
    {
      method: action ? "POST" : "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: action
        ? JSON.stringify({ token: route.token, request_id: requestId })
        : undefined,
      signal,
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 404 || response.status === 403
        ? "Ссылка недействительна или больше недоступна. Обратитесь в заведение."
        : "Не удалось подтвердить состояние оплаты. Проверьте статус позже.",
    );
  const data = (await response.json()) as GuestDeposit;
  if (
    data.id !== route.depositId ||
    !Number.isSafeInteger(data.amount_minor) ||
    data.amount_minor < 1
  )
    throw new Error("Не удалось проверить данные депозита.");
  return data;
}

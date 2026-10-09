export function isTenantRecoveryPage(path: string): boolean {
  return path === "/forgot-password" || path === "/reset-password";
}
export async function tenantRecoveryResponse(
  apiOrigin: string,
  path: string,
  init: RequestInit = {},
  transport: typeof fetch = fetch,
): Promise<Response> {
  const method = init.method ?? "GET";
  if (
    !(
      (path === "/auth/recovery/telegram" && method === "GET") ||
      (path === "/auth/recovery/reset" && method === "POST")
    )
  )
    throw new Error("Этот запрос недоступен на странице восстановления.");
  return transport(apiOrigin + "/api" + path, {
    ...init,
    credentials: "omit",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
}

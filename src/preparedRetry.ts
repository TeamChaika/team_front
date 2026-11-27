const pendingMessage = "Обновляем закупочные цены. Повторите через несколько секунд.";

export function preparedRetryDelay(error: unknown, retries: number): number | null {
  if (retries >= 3 || !error || typeof error !== "object") return null;
  const status = "status" in error ? error.status : undefined;
  const message = "message" in error ? error.message : undefined;
  return status === 503 && message === pendingMessage ? 15_000 : null;
}

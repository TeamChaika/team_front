export function recoveryTokenFromHash(hash: string): string | null {
  if (hash.length > 100 || !hash.startsWith("#")) return null;
  const values = new URLSearchParams(hash.slice(1)).getAll("token");
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0])
    ? values[0]
    : null;
}

export function recoveryCanRetry(status: number | undefined): boolean {
  // These responses happen before the one-use token is claimed by the server.
  return status === 422 || status === 429;
}

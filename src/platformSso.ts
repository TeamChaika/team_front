/** Short-lived browser proof only. No password, token or grant is persisted. */
function randomProof() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
let startRequest: Promise<void> | undefined;
export function startPlatformLogin(
  companyId: string,
  platformOrigin: string,
): Promise<void> {
  startRequest ??= beginPlatformLogin(companyId, platformOrigin).catch(
    (error) => {
      startRequest = undefined;
      throw error;
    },
  );
  return startRequest;
}
async function beginPlatformLogin(companyId: string, platformOrigin: string) {
  const central = new URL(platformOrigin);
  if (
    central.origin !== platformOrigin ||
    !["https:", "http:"].includes(central.protocol) ||
    (central.protocol === "http:" &&
      central.hostname !== "127.0.0.1" &&
      central.hostname !== "localhost")
  )
    throw new Error("Центральный вход не настроен");
  const state = randomProof(),
    nonce = randomProof(),
    verifier = randomProof();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  sessionStorage.setItem(
    "restcontrol_sso_proof",
    JSON.stringify({
      state,
      nonce,
      verifier,
      companyId,
      expires: Date.now() + 300000,
    }),
  );
  const query = new URLSearchParams({
    company_id: companyId,
    state,
    nonce,
    challenge,
  });
  window.location.assign(`${platformOrigin}/sso/authorize?${query}`);
}
let completion: Promise<boolean> | undefined;
export function completePlatformLogin(
  slug: string,
  companyId: string,
  apiOrigin: string,
): Promise<boolean> {
  if (completion) return completion;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (!fragment.has("sso_code")) return Promise.resolve(false);
  const code = fragment.get("sso_code");
  window.history.replaceState(null, "", window.location.pathname);
  completion = (async () => {
    const raw = sessionStorage.getItem("restcontrol_sso_proof");
    sessionStorage.removeItem("restcontrol_sso_proof");
    if (!raw) throw new Error("Запустите вход владельца ещё раз");
    const proof = JSON.parse(raw);
    if (
      proof.companyId !== companyId ||
      proof.expires < Date.now() ||
      proof.state !== fragment.get("state") ||
      proof.nonce !== fragment.get("nonce")
    )
      throw new Error("Не удалось подтвердить вход владельца");
    const response = await fetch(
      `${apiOrigin}/api/saas-tenant/${encodeURIComponent(slug)}/auth/sso/exchange`,
      {
        method: "POST",
        credentials: apiOrigin ? "include" : "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          state: proof.state,
          nonce: proof.nonce,
          verifier: proof.verifier,
        }),
      },
    );
    if (!response.ok)
      throw new Error("Вход владельца истёк. Повторите переход.");
    return true;
  })();
  return completion;
}

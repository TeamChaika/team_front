import { useEffect, useState } from "react";
import { api, setCsrf } from "./saasAdminApi";

const params = new URLSearchParams(window.location.search);
const proof = {
  company_id: params.get("company_id"),
  state: params.get("state"),
  nonce: params.get("nonce"),
  challenge: params.get("challenge"),
};
let authorization: Promise<void> | undefined;
function authorize(csrf: string) {
  authorization ??= (async () => {
    const response = await fetch("/api/saas-admin/sso/authorize", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(proof),
    });
    if (!response.ok)
      throw new Error(
        "Не удалось открыть компанию. Повторите переход из её кабинета.",
      );
    const result = await response.json();
    const target = new URL(result.frontend_origin);
    if (
      target.protocol !== "https:" ||
      target.origin !== result.frontend_origin ||
      result.state !== proof.state ||
      result.nonce !== proof.nonce
    )
      throw new Error("Неверный адрес компании");
    const hash = new URLSearchParams({
      sso_code: result.code,
      state: result.state,
      nonce: result.nonce,
    });
    window.location.replace(`${target.origin}/#${hash}`);
  })();
  return authorization;
}
export default function PlatformSsoAuthorize() {
  const [needLogin, setNeedLogin] = useState(false),
    [error, setError] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .me()
      .then((data) => authorize(data.csrf_token))
      .catch((e) => {
        if (e.status === 401) setNeedLogin(true);
        else setError(e.message);
      });
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api.login(email, password);
      setPassword("");
      setCsrf(data.csrf_token);
      await authorize(data.csrf_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Вход не выполнен");
      authorization = undefined;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sa-auth">
      <div className="sa-login">
        <h1>Вход владельца сервиса</h1>
        {error && <p role="alert">{error}</p>}
        {needLogin ? (
          <form onSubmit={login}>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Пароль
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy}>Войти и открыть компанию</button>
          </form>
        ) : (
          <p role="status">Проверяем вход и открываем компанию…</p>
        )}
        <a href="/">Вернуться в SaaS</a>
      </div>
    </main>
  );
}

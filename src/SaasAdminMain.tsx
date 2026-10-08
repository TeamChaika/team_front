import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SaasAdmin from "./SaasAdmin";
import "./saasAdmin.css";
import SaasTenant from "./SaasTenant";
import {
  loadSaasContext,
  resolveSaasEntry,
  type SaasEntry,
} from "./saasTenantApi";

// One host lookup per page load, shared by StrictMode effect replays.
let contextRequest: ReturnType<typeof loadSaasContext> | undefined;
function SaasEntryPage() {
  const [entry, setEntry] = useState<SaasEntry | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    contextRequest ??= loadSaasContext();
    contextRequest
      .then((context) => {
        if (live) setEntry(resolveSaasEntry(context, window.location.pathname));
      })
      .catch((reason: unknown) => {
        if (live)
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось определить компанию.",
          );
      });
    return () => {
      live = false;
    };
  }, []);
  if (error || entry?.surface === "denied")
    return (
      <main className="sa-auth" role="alert">
        {error || "Страница компании не найдена"}
      </main>
    );
  if (!entry)
    return (
      <main className="sa-auth" role="status">
        Определяем компанию…
      </main>
    );
  return entry.surface === "platform" ? (
    <SaasAdmin />
  ) : (
    <SaasTenant
      key={entry.slug}
      slug={entry.slug}
      companyName={entry.companyName}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SaasEntryPage />
  </React.StrictMode>,
);

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { dashboardTheme } from "./dashboardTheme";
import "@mantine/core/styles.css";
import "./styles.css";
import SaasAdmin from "./SaasAdmin";
import "./saasAdmin.css";
import SaasTenant from "./SaasTenant";
import PlatformSsoAuthorize from "./PlatformSsoAuthorize";
import { resolveSharedTenantEntry } from "./sharedDashboardEntry";
import { TenantGuestDeposit } from "./TenantGuestDeposit";
import TenantPasswordRecovery from "./TenantPasswordRecovery";
import { isTenantRecoveryPage } from "./tenantRecoveryRequest";
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
    contextRequest ??= loadSaasContext("", true);
    contextRequest
      .then((context) => {
        if (live)
          setEntry(
            context.surface === "platform"
              ? resolveSaasEntry(context, window.location.pathname)
              : resolveSharedTenantEntry(
                  window.location.origin,
                  context,
                  window.location.pathname,
                  window.location.search,
                ),
          );
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
  if (
    entry.surface === "platform" &&
    window.location.pathname === "/sso/authorize"
  )
    return <PlatformSsoAuthorize />;
  if (entry.surface === "tenant" && entry.guestDeposit)
    return (
      <MantineProvider theme={dashboardTheme} defaultColorScheme="dark">
        <TenantGuestDeposit
          apiOrigin={window.location.origin}
          companyName={entry.companyName ?? "Заведение"}
          timezone={entry.timezone}
          route={entry.guestDeposit}
        />
      </MantineProvider>
    );
  if (
    entry.surface === "tenant" &&
    isTenantRecoveryPage(window.location.pathname)
  )
    return (
      <MantineProvider theme={dashboardTheme} defaultColorScheme="dark">
        <TenantPasswordRecovery
          apiOrigin={window.location.origin}
          companyName={entry.companyName ?? "Компания"}
          path={window.location.pathname}
        />
      </MantineProvider>
    );
  return entry.surface === "platform" ? (
    <SaasAdmin />
  ) : (
    <SaasTenant
      key={entry.slug}
      slug={entry.slug}
      companyName={entry.companyName}
      companyId={entry.companyId}
      platformOrigin={entry.platformOrigin}
      apiOrigin={window.location.origin}
      fullDashboardAvailable={entry.fullDashboardAvailable}
      workingDashboardAvailable={entry.workingDashboardAvailable}
      featureReadiness={entry.featureReadiness}
      fullDashboardReady={entry.fullDashboardReady === true}
      setupAvailable={entry.setupAvailable}
      setupOnly={
        entry.setupAvailable === true &&
        !entry.workingDashboardAvailable &&
        !entry.fullDashboardReady &&
        !entry.fullDashboardAvailable
      }
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SaasEntryPage />
  </React.StrictMode>,
);

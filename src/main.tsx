import React, { lazy, Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import "@mantine/core/styles.css";
import "./styles.css";
import { dashboardTheme } from "./dashboardTheme";
import { dashboardHost, loadSharedTenantEntry } from "./sharedDashboardEntry";
import { isTenantRecoveryPage } from "./tenantRecoveryRequest";
import type { SaasEntry } from "./saasTenantApi";

const TenantPasswordRecovery = lazy(() => import("./TenantPasswordRecovery"));
const App = lazy(() => import("./App"));
const SaasTenant = lazy(() => import("./SaasTenant"));
const TenantGuestDeposit = lazy(() =>
  import("./TenantGuestDeposit").then((module) => ({
    default: module.TenantGuestDeposit,
  })),
);
const opening = (
  <main className="center-screen" role="status">
    Открываем рабочее пространство…
  </main>
);
// The only legacy exceptions come from deployment configuration. Every other host
// must identify its company through its own API; failure never opens Chaika data.
let tenantEntryRequest: Promise<SaasEntry> | undefined;
const hostResolution = (() => {
  try {
    const host = dashboardHost(
      window.location.origin,
      import.meta.env.VITE_PRIMARY_ORIGINS || "",
      import.meta.env.DEV,
    );
    if (host.surface === "tenant") document.title = "Рабочее пространство";
    return { host, error: "" };
  } catch (reason) {
    return { host: undefined, error: (reason as Error).message };
  }
})();
function SharedDashboard() {
  const host = hostResolution.host;
  const [entry, setEntry] = useState<SaasEntry | null>(null);
  const [error, setError] = useState(hostResolution.error);
  useEffect(() => {
    if (!host || host.surface === "primary") return;
    let live = true;
    tenantEntryRequest ??= loadSharedTenantEntry(
      window.location.origin,
      host.apiOrigin,
      window.location.pathname,
      window.location.search,
    );
    tenantEntryRequest
      .then((value) => {
        if (live) setEntry(value);
      })
      .catch((reason) => {
        if (live) setError((reason as Error).message);
      });
    return () => {
      live = false;
    };
  }, [host?.surface]);
  if (error)
    return (
      <main className="center-screen" role="alert">
        {error}
      </main>
    );
  if (host?.surface === "primary")
    return (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );
  if (
    !entry ||
    entry.surface !== "tenant" ||
    !host ||
    host.surface !== "tenant"
  )
    return opening;
  if (isTenantRecoveryPage(window.location.pathname))
    return (
      <TenantPasswordRecovery
        apiOrigin={host.apiOrigin}
        companyName={entry.companyName ?? "Компания"}
        path={window.location.pathname}
      />
    );
  if (entry.guestDeposit)
    return (
      <TenantGuestDeposit
        key={entry.guestDeposit.depositId}
        apiOrigin={host.apiOrigin}
        companyName={entry.companyName ?? "Заведение"}
        timezone={entry.timezone}
        depositId={entry.guestDeposit.depositId}
        token={entry.guestDeposit.token}
      />
    );
  return (
    <SaasTenant
      slug={entry.slug}
      companyName={entry.companyName}
      companyId={entry.companyId}
      platformOrigin={entry.platformOrigin}
      apiOrigin={host.apiOrigin}
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
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={dashboardTheme} defaultColorScheme="dark">
      <Suspense fallback={opening}>
        <SharedDashboard />
      </Suspense>
    </MantineProvider>
  </React.StrictMode>,
);

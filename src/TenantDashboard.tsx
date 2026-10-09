import { useEffect, useMemo, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import {
  installDashboardRuntime,
  type DashboardRuntime,
} from "./dashboardRuntime";
import { dashboardTheme } from "./dashboardTheme";
import "@mantine/core/styles.css";
import "./styles.css";

export default function TenantDashboard({
  runtime,
  companyName,
  companyId,
  logout,
  error,
  basename,
  setupOnly = false,
  preserveHistoryReads = false,
}: {
  runtime: DashboardRuntime;
  companyName: string;
  companyId: string;
  logout: () => Promise<void>;
  error?: string;
  basename: string;
  setupOnly?: boolean;
  preserveHistoryReads?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const tenant = useMemo(
    () => ({
      companyName,
      companyId,
      logout,
      error,
      fullDashboard: runtime.fullDashboard === true,
      featureReadiness: runtime.featureReadiness,
      preserveHistoryReads,
      setupOnly,
    }),
    [
      companyName,
      companyId,
      logout,
      error,
      runtime.fullDashboard,
      runtime.featureReadiness,
      preserveHistoryReads,
      setupOnly,
    ],
  );
  useEffect(() => {
    const dispose = installDashboardRuntime(runtime);
    const previousTitle = document.title;
    document.title = companyName;
    setReady(true);
    return () => {
      dispose();
      document.title = previousTitle;
    };
  }, [runtime, companyName]);
  if (!ready)
    return (
      <main className="center-screen" role="status">
        Открываем рабочее пространство…
      </main>
    );
  return (
    <MantineProvider theme={dashboardTheme} defaultColorScheme="dark">
      <BrowserRouter basename={basename}>
        <App tenant={tenant} />
      </BrowserRouter>
    </MantineProvider>
  );
}

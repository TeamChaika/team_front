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
  logout,
  error,
  basename,
}: {
  runtime: DashboardRuntime;
  companyName: string;
  logout: () => Promise<void>;
  error?: string;
  basename: string;
}) {
  const [ready, setReady] = useState(false);
  const tenant = useMemo(
    () => ({ companyName, logout, error }),
    [companyName, logout, error],
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

import React from "react";
import { createRoot } from "react-dom/client";
import SaasAdmin from "./SaasAdmin";
import "./saasAdmin.css";
import SaasTenant from "./SaasTenant";
import { tenantSlugFromPath } from "./saasAdminModel";
const tenantSlug = tenantSlugFromPath(window.location.pathname);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/tenant/") ? (
      tenantSlug ? (
        <SaasTenant key={tenantSlug} slug={tenantSlug} />
      ) : (
        <main className="sa-auth">Страница компании не найдена</main>
      )
    ) : (
      <SaasAdmin />
    )}
  </React.StrictMode>,
);

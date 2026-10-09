import { useMemo } from "react";
import { BrowserRouter } from "react-router-dom";
import { ApiError } from "./api";
import {
  ForgotPassword,
  ResetPassword,
  type RecoveryRequest,
} from "./PasswordRecovery";
import { tenantRecoveryResponse } from "./tenantRecoveryRequest";

export default function TenantPasswordRecovery({
  apiOrigin,
  companyName,
  path,
}: {
  apiOrigin: string;
  companyName: string;
  path: string;
}) {
  const request = useMemo<RecoveryRequest>(
    () =>
      async <T,>(endpoint: string, init?: RequestInit) => {
        const response = await tenantRecoveryResponse(
          apiOrigin,
          endpoint,
          init,
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new ApiError(
            typeof data.detail === "string"
              ? data.detail
              : "Восстановление недоступно. Запросите новую ссылку.",
            response.status,
          );
        return data as T;
      },
    [apiOrigin],
  );
  return (
    <BrowserRouter>
      {path === "/forgot-password" ? (
        <ForgotPassword request={request} companyName={companyName} />
      ) : (
        <ResetPassword request={request} companyName={companyName} />
      )}
    </BrowserRouter>
  );
}

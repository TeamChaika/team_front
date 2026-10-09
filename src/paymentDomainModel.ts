export type PaymentDomainSettings = {
  company_version: number;
  revision: number;
  domain: string | null;
  status: "unconfigured" | "pending" | "active";
  payment_origin: string | null;
};
export type PaymentDomainWrite = {
  expected_version: number;
  expected_revision: number;
  domain: string | null;
};
export function paymentDomainWrite(
  settings: PaymentDomainSettings,
  value: string,
): PaymentDomainWrite {
  const domain = value.trim().toLowerCase();
  if (
    domain &&
    (domain.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))
  )
    throw new Error("Укажите домен без https:// и пути.");
  return {
    expected_version: settings.company_version,
    expected_revision: settings.revision,
    domain: domain || null,
  };
}

import type { CompanyWrite } from './saasAdminModel';
export type Subscription = CompanyWrite['subscription'];
export type EntitlementCatalog = {
  version: number;
  features: {id: string; label: string; module: keyof CompanyWrite['modules'] | null}[];
  plans: {id: string; label: string; features: string[]}[];
};
export function choosePlan(subscription: Subscription, planId: string): Subscription {
  return {...subscription, policy: 'plans_v1', plan_id: planId, overrides: subscription.overrides || {}};
}
export function setOverride(subscription: Subscription, id: string, mode: 'allow' | 'deny' | 'inherit', expiresAt: string | null = null): Subscription {
  const overrides = {...subscription.overrides};
  if(mode === 'inherit') delete overrides[id];
  else overrides[id] = {mode, expires_at: expiresAt};
  return {...subscription, overrides};
}

export function expiryUtcForInput(value: string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 16) : '';
}

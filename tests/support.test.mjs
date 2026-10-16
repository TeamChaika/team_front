import test from "node:test";
import assert from "node:assert/strict";
import { createSupportAttempt, createSupportCapture, supportScreen, supportCodeLabels } from "../src/supportModel.ts";
import { createTenantApi } from "../src/saasTenantApi.ts";

test("screen capture uses a closed vocabulary and discards secrets and tenant slugs", () => {
  assert.equal(supportScreen("/tenant/private-company/sales/daily?token=secret"), "sales");
  assert.equal(supportScreen("/reset-password?token=secret"), "other");
  assert.equal(supportScreen("/d/guest-secret"), "other");
  assert.equal(supportScreen("/tenant/secret-company/"), "overview");
  assert.equal(supportScreen("/invoices/12"), "incoming");
});
test("telemetry keeps only structural fields, deduplicates, caps and never propagates transport errors", async () => {
  const calls=[];let now=0;
  const capture=createSupportCapture(body=>{calls.push(body);return Promise.reject(new Error("private"));},()=>"/sales/private?token=secret",()=>now);
  capture("api_error",401,"token=secret");
  assert.equal(calls.length,0);
  capture("api_error",503,"token=secret");capture("api_error",503);
  assert.equal(calls.length,1);
  assert.deepEqual(Object.keys(calls[0]).sort(),["client_request_id","source","code","screen","status_code"].sort());
  assert.equal(calls[0].screen,"sales");
  const id="b748da71-0453-4d20-a8af-43d57962a276";
  now=60_000;capture("api_error",503,id);
  assert.equal(calls[1].request_id,id);
  for(let index=0;index<100;index++){capture("api_error",500+index%100);}
  assert.equal(calls.length,20);
  now+=10*60_000;capture("browser_error");
  assert.equal(calls.length,21);
  assert.doesNotThrow(()=>createSupportCapture(()=>{throw Error("private");},()=>"/")("unhandled_rejection"));
  await new Promise(resolve=>setTimeout(resolve,0));
});
test("tenant support uses central tenant namespace and rotated CSRF with business modules unavailable", async t => {
  const calls=[];
  t.mock.method(globalThis,"fetch",async(url,init)=>{calls.push({url,init});return Response.json(url.endsWith("/auth/me")?{csrf_token:"fresh"}:{items:[],total:0});});
  const tenant=createTenantApi("company-a");await tenant.me();
  const runtime=tenant.dashboardRuntime(()=>{},()=>{},false,{},true);
  await runtime.support.list(25);
  await runtime.support.create({client_request_id:crypto.randomUUID(),description:"Не работает отчёт",screen:"sales"});
  await runtime.support.event({client_request_id:crypto.randomUUID(),source:"browser",code:"browser_error",screen:"sales"});
  assert.equal(calls[1].url,"/api/saas-tenant/company-a/support/tickets?limit=25&offset=25");
  assert.equal(calls[2].url,"/api/saas-tenant/company-a/support/tickets");
  assert.equal(calls[3].url,"/api/saas-tenant/company-a/support/events");
  for(const call of calls.slice(2)){assert.equal(call.init.headers["X-CSRF-Token"],"fresh");assert.equal(call.init.credentials,"same-origin");assert.equal("company_id" in JSON.parse(call.init.body),false);}
});

test("uncertain report delivery retries identical full payload across navigation until edit or success", async () => {
  const attempt = createSupportAttempt();
  const first = attempt.prepare("Не работает отчёт", "/sales");
  // The server accepted the request, but its response was lost.
  const accepted = new Map([[first.client_request_id, JSON.stringify(first)]]);
  const retry = attempt.prepare("Не работает отчёт", "/management");
  assert.deepEqual(retry, first);
  assert.equal(accepted.get(retry.client_request_id), JSON.stringify(retry));
  assert.equal(retry.screen, "sales");
  assert.equal(Object.isFrozen(retry), true);
  attempt.reset(); // Editing or confirmed delivery starts a new attempt.
  const edited = attempt.prepare("Не работает другой отчёт", "/management");
  assert.notEqual(edited.client_request_id, first.client_request_id);
  assert.equal(edited.screen,"management");
});
test("every server incident code has a distinct operator label", () => {
  const codes=["http_5xx","unhandled_exception","sync_failed","document_failed"];
  assert.equal(new Set(codes.map(code=>supportCodeLabels[code])).size, codes.length);
  for(const code of codes)assert.equal(typeof supportCodeLabels[code],"string");
});

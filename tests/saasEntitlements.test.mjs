import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePlan, setOverride, expiryUtcForInput } from '../src/saasEntitlementsModel.ts';
import { normalizeCompany, emptyCompany } from '../src/saasAdminModel.ts';

test('versioned company save preserves full subscription policy', ()=> {
 const c=emptyCompany();
 c.subscription=choosePlan(c.subscription,'full');
 c.subscription=setOverride(c.subscription,'payments.create','deny','2026-10-09T00:00:00Z');
 assert.deepEqual(normalizeCompany(c).subscription,c.subscription);
 assert.equal(c.subscription.policy,'plans_v1');
});
test('inherit removes override while preserving plan and dates',()=> {
 const sub={plan:'legacy label',start_date:'2026-10-08',end_date:null};
 const next=setOverride(choosePlan(sub,'analytics'),'payments.create','allow');
 assert.equal(next.overrides['payments.create'].mode,'allow');
 assert.deepEqual(setOverride(next,'payments.create','inherit').overrides,{});
 assert.equal(next.start_date,sub.start_date);
});
test('editing legacy metadata does not silently switch policy',()=> {
 const c=emptyCompany(); c.subscription={plan:'Old custom plan',start_date:null,end_date:null};
 assert.deepEqual(normalizeCompany(c).subscription,c.subscription);
});

test('override expiration displays UTC even when stored with an offset',()=> {
 assert.equal(expiryUtcForInput('2026-10-08T12:00:00+03:00'),'2026-10-08T09:00');
});

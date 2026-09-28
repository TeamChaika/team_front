import assert from 'node:assert/strict';
import test from 'node:test';
import { documentPayload, submissionLabel } from '../src/documentModel.ts';

const draft = {
  store_id: 'sender', counteragent_id: 'receiver', comment: '',
  items: [{ product_id: 'product', name: 'Product', amount: '0,000125' }],
};

test('document quantities retain small fractions without rounding', () => {
  const payload = documentPayload('waybill', draft, 'request');
  assert.equal(payload.items[0].amount, 0.000125);
  assert.equal(payload.request_id, 'request');
  assert.equal(payload.items[0].name, undefined);
});

test('non-positive, non-finite and duplicate items are rejected', () => {
  for (const amount of ['', 0, -1, Infinity, NaN]) {
    assert.throws(() => documentPayload('waybill', { ...draft, items: [{ product_id: 'x', amount }] }, 'request'));
  }
  assert.throws(() => documentPayload('waybill', { ...draft, items: [...draft.items, ...draft.items] }, 'request'));
});

test('document limits and sender/receiver equality are checked before submission', () => {
  assert.throws(() => documentPayload('waybill', { ...draft, counteragent_id: 'sender' }, 'request'));
  assert.throws(() => documentPayload('waybill', { ...draft, comment: 'x'.repeat(1001) }, 'request'));
  assert.throws(() => documentPayload('waybill', { ...draft, items: [] }, 'request'));
});

test('writeoff requires a reason and does not send a recipient', () => {
  assert.throws(() => documentPayload('writeoff', draft, 'request'));
  const payload = documentPayload('writeoff', { ...draft, reason: 'Expired', reason_id: 1 }, 'request');
  assert.equal(payload.reason, 'Expired');
  assert.equal(payload.counteragent_id, undefined);
});

test('uncertain and sent statuses do not claim a posted document', () => {
  assert.match(submissionLabel('unknown'), /провер/i);
  assert.match(submissionLabel('sending'), /отправ/i);
  assert.doesNotMatch(submissionLabel('sent'), /проведён/i);
});

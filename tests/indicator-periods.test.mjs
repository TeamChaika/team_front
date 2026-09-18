import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periods } from '../src/indicatorPeriods.ts';
const custom = { start: '2026-08-05', end: '2026-08-18' };
for (const [preset, expected] of Object.entries({
  today: ['2026-09-18','2026-09-18','2026-09-17','2026-09-17'],
  yesterday: ['2026-09-17','2026-09-17','2026-09-16','2026-09-16'],
  this_week: ['2026-09-14','2026-09-18','2026-09-07','2026-09-11'],
  last_week: ['2026-09-07','2026-09-13','2026-08-31','2026-09-06'],
  this_month: ['2026-09-01','2026-09-18','2026-08-01','2026-08-18'],
  last_month: ['2026-08-01','2026-08-31','2026-07-01','2026-07-31'],
  this_year: ['2026-01-01','2026-09-18','2025-01-01','2025-09-18'],
  last_year: ['2025-01-01','2025-12-31','2024-01-01','2024-12-31'],
  custom: ['2026-08-05','2026-08-18','2026-07-22','2026-08-04'],
})) test(preset, () => assert.deepEqual(Object.values(periods(preset, '2026-09-18', custom)),expected));
test('Monday compares the preceding Monday, not Sunday',()=> assert.equal(periods('this_week','2026-09-14',custom).previous_end,'2026-09-07'));
test('Sunday closes the full week',()=> assert.equal(periods('this_week','2026-09-20',custom).start,'2026-09-14'));
test('month with fewer days clamps at month end',()=> assert.equal(periods('this_month','2026-03-31',custom).previous_end,'2026-02-28'));
test('leap day compares with February 28',()=> assert.equal(periods('this_year','2024-02-29',custom).previous_end,'2023-02-28'));
test('January crosses year boundary',()=> assert.deepEqual(Object.values(periods('last_month','2026-01-01',custom)),['2025-12-01','2025-12-31','2025-11-01','2025-11-30']));

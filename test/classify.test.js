import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, summarise } from '../lib/classify.js';

test('visa free enters with no loss', () => {
  const r = classify({ iso3: 'GHA', name: 'Ghana', count: 10, req: '90', route: 'ACC → KGL' });
  assert.equal(r.status, 'enters');
  assert.equal(r.expectedLost, 0);
});

test('visa required uses the per state refusal rate first', () => {
  const r = classify({ iso3: 'NGA', name: 'Nigeria', count: 100, req: 'visa required', stateRate: 0.6, regimeRate: 0.46, regime: 'SCHENGEN', route: 'LOS → LIS' });
  assert.equal(r.status, 'needs_visa');
  assert.equal(r.expectedLost, 60);
});

test('unknown refusal rate is unknown risk, not loss', () => {
  const r = classify({ iso3: 'NGA', name: 'Nigeria', count: 50, req: 'visa required', route: 'LOS → DXB' });
  assert.equal(r.expectedLost, 0);
  assert.equal(r.unknownRisk, 50);
});

test('a held US visa unlocks Mexico for that share', () => {
  const r = classify({ iso3: 'NGA', name: 'Nigeria', count: 100, req: 'visa required', regimeRate: null, unlocks: [{ visa: 'US', only: null }], route: 'LOS → MEX' }, { us: 0.3 });
  assert.equal(r.unknownRisk, 70);
});

test('unlock limited to other nationalities does not apply', () => {
  const r = classify({ iso3: 'NGA', name: 'Nigeria', count: 10, req: 'visa required', unlocks: [{ visa: 'US', only: ['IND'] }], route: 'x' }, { us: 1 });
  assert.equal(r.unknownRisk, 10);
});

test('no admission loses everyone', () => {
  const r = classify({ iso3: 'X', name: 'X', count: 7, req: 'no admission', route: 'x' });
  assert.equal(r.expectedLost, 7);
});

test('summary keeps pct', () => {
  const s = summarise({ id: 'c' }, [{ count: 100, expectedLost: 25, unknownRisk: 0 }, { count: 100, expectedLost: 0, unknownRisk: 10 }]);
  assert.equal(s.keepsPct, 87.5);
  assert.equal(s.unknownRisk, 10);
});

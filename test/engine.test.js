import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ecTargetForYield, leachingRequirement, tdsToEc, netNeedLitres, grossLitres,
  runMinutes, formatDuration, decideBlock, compareHabit, annualEstimate, DEFAULTS,
} from '../src/engine.js';
import { LIWA } from '../src/data.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('date palm salt tolerance (FAO-29: threshold 4.0 dS/m, slope 3.6 %/dS/m)', () => {
  assert.equal(ecTargetForYield(100), 4.0);
  near(ecTargetForYield(90), 6.78, 0.01);
});

test('leaching requirement LR = ECw / (5·ECe − ECw)', () => {
  near(leachingRequirement(6, 4), 6 / 14, 1e-9);
  assert.equal(leachingRequirement(0, 4), 0);
});

test('water too salty to leach is flagged, not silently capped', () => {
  assert.equal(leachingRequirement(20, 4), Infinity);
  assert.equal(leachingRequirement(25, 4), Infinity);
});

test('TDS pen ppm → EC dS/m (÷640)', () => {
  near(tdsToEc(3840), 6, 1e-9);
});

test('net need = ET0 × Kc × canopy area, minus effective rain, never negative', () => {
  near(netNeedLitres({ et0: 4.39 }), 4.39 * 0.95 * 18, 1e-9);
  near(netNeedLitres({ et0: 5, rainMm: 2 }), 5 * 0.95 * 18 - 0.8 * 2 * 18, 1e-9);
  assert.equal(netNeedLitres({ et0: 1, rainMm: 30 }), 0);
});

test('VALIDATION: model matches EAD sap-flow study (≈180 L/day summer, 60–80 L/day winter)', () => {
  const june = netNeedLitres({ et0: LIWA.monthlyEt0['2026-06'] });
  const jan = netNeedLitres({ et0: LIWA.monthlyEt0['2026-01'] });
  assert.ok(june >= 160 && june <= 200, `June ${june}`);
  assert.ok(jan >= 55 && jan <= 80, `Jan ${jan}`);
});

test('gross = net ÷ efficiency ÷ (1 − LR)', () => {
  near(grossLitres(90, { efficiency: 0.9, lr: 0.25 }), 90 / 0.9 / 0.75, 1e-9);
});

test('run time rounds UP to 5 minutes so palms are never short', () => {
  assert.equal(runMinutes(87.5, 4, 16), 85); // 82.03 → 85
  assert.equal(runMinutes(64, 4, 16), 60);   // exactly 60
  assert.equal(runMinutes(0, 4, 16), 0);
});

test('formatDuration', () => {
  assert.equal(formatDuration(110), '1 h 50 min');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(120), '2 h');
});

const blockB = { name: 'B', palms: 200, ecw: 6, emitters: 4, flowLph: 16 };

test('decideBlock: today in Liwa (ET0 4.39) on a brackish well beats the 300 L habit', () => {
  const d = decideBlock(blockB, { et0: 4.39, rain: 0 }, DEFAULTS);
  assert.ok(d.grossL < DEFAULTS.habitL);
  assert.equal(d.minutes % 5, 0);
  assert.ok(d.savedM3 > 0);
  assert.equal(d.saltWarning, false);
  near(d.lr, 6 / 14, 1e-9);
});

test('decideBlock: unusable water raises a salt warning', () => {
  const d = decideBlock({ ...blockB, ecw: 22 }, { et0: 5, rain: 0 }, DEFAULTS);
  assert.equal(d.saltWarning, true);
});

test('compareHabit on real Liwa data: saves water overall and counts salt-risk days', () => {
  const r = compareHabit(LIWA.daily, blockB, DEFAULTS);
  assert.equal(r.days.length, LIWA.daily.length);
  assert.ok(r.totals.savedM3 > 0);
  assert.ok(Number.isInteger(r.totals.riskDays));
});

test('annualEstimate: brackish well (EC 6) still saves water over a real Liwa year', () => {
  const r = annualEstimate(LIWA.monthlyEt0, blockB, DEFAULTS);
  assert.equal(r.months.length, 12);
  assert.ok(r.totals.savedM3 > 0);
});

test('annualEstimate: a very salty well (EC 8) is wasted in winter but STARVED by habit in summer', () => {
  const r = annualEstimate(LIWA.monthlyEt0, { ...blockB, ecw: 8 }, DEFAULTS);
  const june = r.months.find((m) => m.month === '2026-06');
  const jan = r.months.find((m) => m.month === '2026-01');
  assert.ok(june.nakhlaL > DEFAULTS.habitL, 'habit under-waters salty block in June → salt builds up');
  assert.ok(jan.nakhlaL < DEFAULTS.habitL, 'habit over-waters in January');
});

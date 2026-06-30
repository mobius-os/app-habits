import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALUE, frequencyToFloat, isSuccess, dayCompletion,
  computeScores, strength, currentStreak, bestStreaks,
} from './domain.js';

// --- tiny date helper (mirrors domain's UTC string math) ---
const DAY = 86400000;
function d(base, offset) {
  const [y, m, dd] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd) + offset * DAY);
  return dt.toISOString().slice(0, 10);
}
const TODAY = '2024-03-31';

const dailyBool = { type: 'YES_NO', freqNum: 1, freqDen: 1 };
const weekly3 = { type: 'YES_NO', freqNum: 3, freqDen: 7 };
const numAtLeast = { type: 'NUMERICAL', targetType: 'AT_LEAST', targetValue: 2, freqNum: 1, freqDen: 1, unit: 'mi' };
const numAtMost = { type: 'NUMERICAL', targetType: 'AT_MOST', targetValue: 2, freqNum: 1, freqDen: 1, unit: 'cig' };

function perfect(base, days) {
  const e = {};
  for (let i = 0; i < days; i++) e[d(base, -i)] = VALUE.YES_MANUAL;
  return e;
}

test('frequencyToFloat', () => {
  assert.equal(frequencyToFloat(dailyBool), 1);
  assert.ok(Math.abs(frequencyToFloat(weekly3) - 3 / 7) < 1e-12);
});

test('EMA numeric anchors (daily boolean)', () => {
  // one perfect day from zero -> S = 1 - alpha, alpha = 0.5^(1/13)
  const one = strength(dailyBool, perfect(TODAY, 1), TODAY);
  assert.ok(Math.abs(one - 0.0519182) < 1e-3, `first perfect day ${one}`);
  // ~80% at 30 days, ~99% at 90 days
  const s30 = strength(dailyBool, perfect(TODAY, 30), TODAY);
  assert.ok(s30 > 0.78 && s30 < 0.82, `30-day ${s30}`);
  const s90 = strength(dailyBool, perfect(TODAY, 90), TODAY);
  assert.ok(s90 >= 0.99, `90-day ${s90}`);
});

test('SKIP is excluded from the EMA (score carries forward) and does not break the streak', () => {
  const base = { [d(TODAY, -1)]: VALUE.YES_MANUAL, [TODAY]: VALUE.SKIP };
  const sPrev = strength(dailyBool, { [d(TODAY, -1)]: VALUE.YES_MANUAL }, d(TODAY, -1));
  const sNow = strength(dailyBool, base, TODAY);
  assert.ok(Math.abs(sNow - sPrev) < 1e-12, `SKIP changed score ${sPrev} -> ${sNow}`);
  // SKIP counts as a success day for the streak
  assert.equal(currentStreak(dailyBool, base, TODAY), 2);
});

test('a single miss lowers the score gradually, not to zero', () => {
  const e = { [d(TODAY, -2)]: VALUE.YES_MANUAL, [d(TODAY, -1)]: VALUE.YES_MANUAL, [TODAY]: VALUE.NO };
  const sBeforeMiss = strength(dailyBool, e, d(TODAY, -1));
  const sAfterMiss = strength(dailyBool, e, TODAY);
  assert.ok(sAfterMiss > 0, 'not zeroed');
  assert.ok(sAfterMiss < sBeforeMiss, 'lowered');
});

test('non-daily boolean: 3 checks in a 3x/week period read as satisfied (YES_AUTO fill)', () => {
  const three = { [TODAY]: VALUE.YES_MANUAL, [d(TODAY, -3)]: VALUE.YES_MANUAL, [d(TODAY, -6)]: VALUE.YES_MANUAL };
  const c = dayCompletion(weekly3, three, TODAY);
  assert.ok(c >= 0.9, `3 checks completion ${c}`);
  const oneOnly = { [TODAY]: VALUE.YES_MANUAL };
  const c1 = dayCompletion(weekly3, oneOnly, TODAY);
  assert.ok(c1 < 0.5 && c1 > 0, `1 check completion ${c1}`);
});

test('numerical AT_LEAST completion fraction', () => {
  assert.ok(Math.abs(dayCompletion(numAtLeast, { [TODAY]: 1000 }, TODAY) - 0.5) < 1e-9); // 1.0 of target 2
  assert.equal(dayCompletion(numAtLeast, { [TODAY]: 2000 }, TODAY), 1);                  // hit target
  assert.equal(dayCompletion(numAtLeast, { [TODAY]: 5000 }, TODAY), 1);                  // capped at 1
});

test('numerical AT_MOST: seeds at 1.0, under cap stays satisfied, over cap drops', () => {
  // no entries at all -> fully satisfied (S_0 = 1.0)
  assert.equal(strength(numAtMost, {}, TODAY), 1);
  // under the cap -> completion 1.0
  assert.equal(dayCompletion(numAtMost, { [TODAY]: 1000 }, TODAY), 1); // 1.0 <= 2
  // over the cap -> completion 0.5, strength drops below 1
  assert.ok(Math.abs(dayCompletion(numAtMost, { [TODAY]: 3000 }, TODAY) - 0.5) < 1e-9); // 3.0 vs cap 2
  const over = strength(numAtMost, { [TODAY]: 3000 }, TODAY);
  assert.ok(over < 1 && over > 0.9, `AT_MOST over-cap strength ${over}`);
});

test('numerical SKIP is excluded from the EMA too', () => {
  assert.equal(dayCompletion(numAtLeast, { [TODAY]: VALUE.SKIP }, TODAY), null);
});

test('currentStreak returns an integer length', () => {
  const e = perfect(TODAY, 5);
  const cs = currentStreak(dailyBool, e, TODAY);
  assert.ok(Number.isInteger(cs));
  assert.equal(cs, 5);
  // a NO today breaks it
  assert.equal(currentStreak(dailyBool, { ...e, [TODAY]: VALUE.NO }, TODAY), 0);
});

test('bestStreaks: longest n, most-recent-end tiebreak', () => {
  // streak A (len 5) ends 2024-01-05; streak B (len 3) ends 2024-02-12
  const e = {};
  for (let i = 0; i < 5; i++) e[d('2024-01-05', -i)] = VALUE.YES_MANUAL;
  for (let i = 0; i < 3; i++) e[d('2024-02-12', -i)] = VALUE.YES_MANUAL;
  const top = bestStreaks(dailyBool, e, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].length, 5);
  assert.equal(top[1].length, 3);
  // tiebreak: two equal-length streaks -> most recent end first
  const t = {};
  for (let i = 0; i < 2; i++) t[d('2024-01-02', -i)] = VALUE.YES_MANUAL; // ends 01-02
  for (let i = 0; i < 2; i++) t[d('2024-03-02', -i)] = VALUE.YES_MANUAL; // ends 03-02
  const tied = bestStreaks(dailyBool, t, 2);
  assert.equal(tied[0].end, '2024-03-02');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { setTimerState, clearTimerState, purgeHabit } from './storage.js';

const today = new URL('./ui/Today.jsx', import.meta.url);
const habitForm = new URL('./ui/HabitForm.jsx', import.meta.url);
const indexJsx = new URL('./index.jsx', import.meta.url);
const theme = new URL('./theme.js', import.meta.url);

const todaySrc = readFileSync(today, 'utf8');
const habitFormSrc = readFileSync(habitForm, 'utf8');
const indexSrc = readFileSync(indexJsx, 'utf8');
const themeSrc = readFileSync(theme, 'utf8');

// --- storage-level: start/pause/reopen, rapid actions, disable/delete cleanup ---

function mockStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const calls = [];
  globalThis.window = {
    mobius: {
      storage: {
        get: async (path) => values.get(path) ?? null,
        set: async (path, value) => {
          calls.push(path);
          values.set(path, structuredClone(value));
          return { queued: true };
        },
        list: async () => [], // no day-logs in these timer-focused fixtures
      },
    },
  };
  return { values, calls, restore: () => { delete globalThis.window; } };
}

test('timer: start then pause persists elapsedMs and clears runningSince (survives "reopen")', async () => {
  const { values, restore } = mockStorage();
  try {
    // start
    await setTimerState('h1', { date: '2026-07-23', elapsedMs: 0, runningSince: 1000 });
    // "reopen the app" — nothing re-reads state here; a fresh read of the
    // persisted record is exactly what a newly-mounted Today would see.
    assert.deepEqual(values.get('timers.json'), { h1: { date: '2026-07-23', elapsedMs: 0, runningSince: 1000 } });
    // pause — commits the elapsed time, clears runningSince
    await setTimerState('h1', { date: '2026-07-23', elapsedMs: 5000, runningSince: null });
    assert.deepEqual(values.get('timers.json'), { h1: { date: '2026-07-23', elapsedMs: 5000, runningSince: null } });
  } finally {
    restore();
  }
});

test('timer: a record from a previous day is left alone by a fresh day\'s write for a DIFFERENT habit (per-habit, not clobbered)', async () => {
  const { values, restore } = mockStorage({
    'timers.json': { stale: { date: '2026-07-01', elapsedMs: 90_000, runningSince: null } },
  });
  try {
    await setTimerState('fresh', { date: '2026-07-23', elapsedMs: 0, runningSince: 2000 });
    assert.deepEqual(values.get('timers.json'), {
      stale: { date: '2026-07-01', elapsedMs: 90_000, runningSince: null },
      fresh: { date: '2026-07-23', elapsedMs: 0, runningSince: 2000 },
    });
  } finally {
    restore();
  }
});

test('timer: rapid start/pause taps on the same habit serialize (no lost update)', async () => {
  const { values, restore } = mockStorage();
  try {
    // Fire a burst of writes without awaiting between them, mirroring rapid
    // taps on the play/pause button — storage.js's per-path write queue must
    // serialize these as read-modify-writes, not race on a stale read.
    await Promise.all([
      setTimerState('h1', { date: '2026-07-23', elapsedMs: 0, runningSince: 1000 }),
      setTimerState('h1', { elapsedMs: 3000, runningSince: null }),
      setTimerState('h1', { runningSince: 4000 }),
    ]);
    const rec = values.get('timers.json').h1;
    // The last enqueued write's fields win, and earlier writes are still
    // reflected in fields it didn't touch (a true read-modify-write chain,
    // not three independent writes clobbering each other) — `date` and
    // `elapsedMs` both survive even though neither was in the final patch.
    assert.equal(rec.date, '2026-07-23');
    assert.equal(rec.elapsedMs, 3000);
    assert.equal(rec.runningSince, 4000);
  } finally {
    restore();
  }
});

test('timer: deleting a habit clears its persisted timer record (purgeHabit)', async () => {
  const { values, restore } = mockStorage({
    'timers.json': { h1: { date: '2026-07-23', elapsedMs: 5000, runningSince: null } },
  });
  try {
    await purgeHabit('h1');
    assert.deepEqual(values.get('timers.json'), {});
  } finally {
    restore();
  }
});

// --- source-contract checks (this repo's established style for React-layer
// behavior that node:test can't exercise directly without a DOM — see
// cross-platform-a11y.test.mjs for precedent) ---

test('Today\'s timer mutations go through the parent-supplied, retryable write props — not storage.js directly', () => {
  assert.match(todaySrc, /onTimerWrite\s*,\s*onTimerClear/, 'Today must accept onTimerWrite/onTimerClear props');
  assert.doesNotMatch(
    todaySrc,
    /\bsetTimerState\(|\bclearTimerState\(/,
    'Today must call onTimerWrite/onTimerClear, not storage.js\'s setTimerState/clearTimerState directly (bypasses the retryable write contract)',
  );
  assert.match(todaySrc, /await onTimerWrite\(/);
  assert.match(todaySrc, /await onTimerClear\(/);
});

test('index.jsx wires Today\'s timer props through attemptWrite, and clears a disabled habit\'s timer', () => {
  assert.match(indexSrc, /writeTimerState[\s\S]{0,80}attemptWrite/, 'timer writes must go through attemptWrite for a visible retry banner on failure');
  assert.match(indexSrc, /clearTimerWrite[\s\S]{0,80}attemptWrite/);
  assert.match(indexSrc, /onTimerWrite=\{writeTimerState\}/);
  assert.match(indexSrc, /onTimerClear=\{clearTimerWrite\}/);
  assert.match(
    indexSrc,
    /prev\??\.useTimer && !habit\.useTimer[\s\S]{0,120}clearTimerState/,
    'saveHabit must clear timer state when a habit\'s timer is turned off',
  );
});

test('Today only lets a CURRENTLY timer-enabled habit\'s record drive the ticking interval (anyRunning)', () => {
  assert.match(
    todaySrc,
    /timerEnabledIds[\s\S]{0,200}useTimer/,
    'anyRunning must be scoped to habits that currently have useTimer on, not every stored timer record',
  );
});

test('HabitForm does not mutate targetType when merely toggling the timer checkbox (preview-then-uncheck must not lose AT_MOST)', () => {
  assert.match(habitFormSrc, /onChange=\{\(e\) => setUseTimer\(e\.target\.checked\)\}/);
  assert.doesNotMatch(
    habitFormSrc,
    /onChange=\{\(e\) => \{ setUseTimer\(e\.target\.checked\); if \(e\.target\.checked\) setTargetType/,
    'checking the timer box must not permanently overwrite targetType state — only save() should coerce it',
  );
});

test('the Today card groups the ring/timer/check controls into one wrapping unit so a habit\'s name is never squeezed to fit', () => {
  assert.match(todaySrc, /className="hb-card-controls"/);
  assert.match(themeSrc, /\.hb-card\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(themeSrc, /\.hb-card-controls\s*\{[^}]*flex:\s*0 0 auto/);
});

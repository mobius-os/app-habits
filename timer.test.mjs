import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  toggleTimerState,
  pauseTimerState,
  clearTimerState,
  saveHabitsWithTimerPolicy,
  purgeHabit,
} from './storage.js';

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
    await toggleTimerState('h1', '2026-07-23', 1000);
    // "reopen the app" — nothing re-reads state here; a fresh read of the
    // persisted record is exactly what a newly-mounted Today would see.
    assert.deepEqual(values.get('timers.json'), { h1: { date: '2026-07-23', elapsedMs: 0, runningSince: 1000 } });
    await pauseTimerState('h1', '2026-07-23', 6000);
    assert.deepEqual(values.get('timers.json'), { h1: { date: '2026-07-23', elapsedMs: 5000, runningSince: null } });
  } finally {
    restore();
  }
});

test('timer: a record from a previous day is left alone by a fresh day\'s command for a DIFFERENT habit', async () => {
  const { values, restore } = mockStorage({
    'timers.json': { stale: { date: '2026-07-01', elapsedMs: 90_000, runningSince: null } },
  });
  try {
    await toggleTimerState('fresh', '2026-07-23', 2000);
    assert.deepEqual(values.get('timers.json'), {
      stale: { date: '2026-07-01', elapsedMs: 90_000, runningSince: null },
      fresh: { date: '2026-07-23', elapsedMs: 0, runningSince: 2000 },
    });
  } finally {
    restore();
  }
});

test('timer: two immediate UI toggle intents serialize as start then pause', async () => {
  const { values, restore } = mockStorage();
  try {
    await Promise.all([
      toggleTimerState('h1', '2026-07-23', 1000),
      toggleTimerState('h1', '2026-07-23', 4000),
    ]);
    const rec = values.get('timers.json').h1;
    assert.equal(rec.date, '2026-07-23');
    assert.equal(rec.elapsedMs, 3000);
    assert.equal(rec.runningSince, null);
  } finally {
    restore();
  }
});

test('timer: toggling a stale prior-day record starts today from zero', async () => {
  const { values, restore } = mockStorage({
    'timers.json': { h1: { date: '2026-07-22', elapsedMs: 90_000, runningSince: 1000 } },
  });
  try {
    await toggleTimerState('h1', '2026-07-23', 5000);
    assert.deepEqual(values.get('timers.json').h1, {
      date: '2026-07-23', elapsedMs: 0, runningSince: 5000,
    });
  } finally {
    restore();
  }
});

test('timer: pause derives elapsed time from committed state, not a rendered snapshot', async () => {
  const { values, restore } = mockStorage({
    'timers.json': { h1: { date: '2026-07-23', elapsedMs: 2000, runningSince: 4000 } },
  });
  try {
    const paused = await pauseTimerState('h1', '2026-07-23', 9000);
    assert.deepEqual(paused, { date: '2026-07-23', elapsedMs: 7000, runningSince: null });
    assert.deepEqual(values.get('timers.json').h1, paused);
  } finally {
    restore();
  }
});

test('timer: reset queued behind a start intent removes the record', async () => {
  const { values, restore } = mockStorage();
  try {
    await Promise.all([
      toggleTimerState('h1', '2026-07-23', 1000),
      clearTimerState('h1'),
    ]);
    assert.deepEqual(values.get('timers.json'), {});
  } finally {
    restore();
  }
});

test('timer: a failed command rejects visibly and does not poison the next retry', async () => {
  const { values, restore } = mockStorage();
  const realSet = window.mobius.storage.set;
  let failTimerOnce = true;
  window.mobius.storage.set = async (path, value) => {
    if (path === 'timers.json' && failTimerOnce) {
      failTimerOnce = false;
      throw new Error('injected timer write failure');
    }
    return realSet(path, value);
  };
  try {
    await assert.rejects(toggleTimerState('h1', '2026-07-23', 1000));
    assert.equal(values.get('timers.json'), undefined);

    await toggleTimerState('h1', '2026-07-23', 2000);
    assert.deepEqual(values.get('timers.json').h1, {
      date: '2026-07-23', elapsedMs: 0, runningSince: 2000,
    });
  } finally {
    restore();
  }
});

test('timer: disabling remains safe to retry after cleanup succeeds but the habits write fails', async () => {
  const { values, restore } = mockStorage({
    'habits.json': [{ id: 'h1', useTimer: true }],
    'timers.json': { h1: { date: '2026-07-23', elapsedMs: 5000, runningSince: 1000 } },
  });
  const realSet = window.mobius.storage.set;
  let failHabitsOnce = true;
  window.mobius.storage.set = async (path, value) => {
    if (path === 'habits.json' && failHabitsOnce) {
      failHabitsOnce = false;
      throw new Error('injected habits write failure');
    }
    return realSet(path, value);
  };
  const disabled = { id: 'h1', useTimer: false };
  try {
    await assert.rejects(saveHabitsWithTimerPolicy([disabled], disabled));
    assert.deepEqual(values.get('timers.json'), {});
    assert.deepEqual(values.get('habits.json'), [{ id: 'h1', useTimer: true }]);

    await saveHabitsWithTimerPolicy([disabled], disabled);
    assert.deepEqual(values.get('timers.json'), {});
    assert.deepEqual(values.get('habits.json'), [disabled]);
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

test('Today sends timer intents through parent-supplied retryable commands — not storage.js directly', () => {
  assert.match(todaySrc, /onTimerToggle,\s*onTimerPause,\s*onTimerReset/);
  assert.doesNotMatch(
    todaySrc,
    /\b(toggleTimerState|pauseTimerState|clearTimerState)\(/,
    'Today must use parent commands rather than bypassing the retryable write contract',
  );
  assert.match(todaySrc, /await onTimerToggle\(/);
  assert.match(todaySrc, /await onTimerPause\(/);
  assert.match(todaySrc, /await onTimerReset\(/);
});

test('index.jsx wires timer intent commands through attemptWrite and delegates disable policy to storage', () => {
  assert.match(indexSrc, /toggleTimerState[\s\S]{0,80}attemptWrite/);
  assert.match(indexSrc, /pauseTimerState[\s\S]{0,80}attemptWrite/);
  assert.match(indexSrc, /resetTimerState[\s\S]{0,80}attemptWrite/);
  assert.match(indexSrc, /onTimerToggle=\{toggleTimerState\}/);
  assert.match(indexSrc, /onTimerPause=\{pauseTimerState\}/);
  assert.match(indexSrc, /onTimerReset=\{resetTimerState\}/);
  assert.match(
    indexSrc,
    /saveHabitsWithTimerPolicy\(next,\s*habit\)/,
    'saveHabit must derive timer cleanup from the requested final habit',
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

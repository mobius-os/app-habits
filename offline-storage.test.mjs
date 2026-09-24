import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { adjustEntry, getDayLog, loadAllLogs, loadHabits, saveHabits, setEntry } from './storage.js';

test('offline manifest is backed by the Mobius storage runtime', async () => {
  const manifest = JSON.parse(readFileSync(new URL('./mobius.json', import.meta.url), 'utf8'));
  assert.equal(manifest.offline_capable, true);
  assert.deepEqual(
    { reads: manifest.offline.reads, writes: manifest.offline.writes, execution: manifest.offline.execution },
    { reads: true, writes: 'queued', execution: 'full' },
  );

  const values = new Map([['habits.json', [{ id: 'walk' }]]]);
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
      },
    },
  };

  try {
    assert.deepEqual(await loadHabits(), [{ id: 'walk' }]);
    await saveHabits([{ id: 'walk' }, { id: 'read' }]);

    // Rapid offline taps must accumulate before the runtime queues each write;
    // otherwise two read-modify-writes can silently lose one update.
    await Promise.all([
      adjustEntry('2026-07-16', 'walk', 1000),
      adjustEntry('2026-07-16', 'walk', 1000),
    ]);
    assert.deepEqual(await getDayLog('2026-07-16'), { walk: 2000 });
    assert.equal(values.get('logs/2026-07-16.json')._mobius.applied.length, 2);
    assert.deepEqual(calls, [
      'habits.json',
      'logs/2026-07-16.json',
      'logs/2026-07-16.json',
    ]);
  } finally {
    delete globalThis.window;
  }
});

test('history keeps its prior view for an incomplete offline listing and refreshes when complete', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });

  let listing = {
    entries: [{ name: '2026-09-20.json', path: 'logs/2026-09-20.json', type: 'file' }],
    complete: true,
    source: 'server',
  };
  globalThis.window = {
    mobius: {
      online: true,
      storage: {
        listWithStatus: async () => listing,
        get: async (path) => ({ [path.includes('21') ? 'walk' : path.includes('22') ? 'read' : 'sleep']: 1 }),
      },
    },
  };

  assert.deepEqual(await loadAllLogs(), {
    '2026-09-20': { sleep: 1 },
  });

  listing = {
    entries: [{ name: '2026-09-21.json', path: 'logs/2026-09-21.json', type: 'file' }],
    complete: false,
    source: 'derived',
  };
  globalThis.window.mobius.online = false;
  assert.equal(await loadAllLogs(), null);

  listing = {
    entries: [
      { name: '2026-09-21.json', path: 'logs/2026-09-21.json', type: 'file' },
      { name: '2026-09-22.json', path: 'logs/2026-09-22.json', type: 'file' },
    ],
    complete: true,
    source: 'server',
  };
  globalThis.window.mobius.online = true;
  assert.deepEqual(await loadAllLogs(), {
    '2026-09-21': { walk: 1 },
    '2026-09-22': { read: 1 },
  });
});

test('complete history membership remains unknown when any listed body is absent', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  globalThis.window = {
    mobius: {
      online: false,
      storage: {
        listWithStatus: async () => ({
          complete: true,
          source: 'cache',
          entries: [{ name: '2026-09-21.json', path: 'logs/2026-09-21.json', type: 'file' }],
        }),
        get: async () => null,
      },
    },
  };

  assert.equal(await loadAllLogs(), null);
});

test('an offline day intent replays over a disjoint remote habit update exactly once', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  let listener;
  let readCount = 0;
  const writes = [];
  globalThis.window = {
    mobius: {
      storage: {
        onConflict(cb) { listener = cb; return () => { listener = null; }; },
        async getWithVersion() {
          readCount += 1;
          return readCount === 1
            ? { value: {}, version: 'baseline-v1' }
            : { value: { read: 1 }, version: 'remote-v2' };
        },
        async durableWrite(path, value, options) {
          writes.push({ path, value, options });
          return { durability: writes.length === 1 ? 'queued' : 'synced' };
        },
      },
    },
  };

  await setEntry('2026-09-23', 'walk', 1);
  const queued = writes[0];
  assert.equal(await listener({
    path: queued.path,
    refusedValue: queued.value,
    conflictContext: queued.options.conflictContext,
  }), true);

  assert.deepEqual(
    Object.fromEntries(Object.entries(writes[1].value).filter(([key]) => key !== '_mobius')),
    { read: 1, walk: 1 },
  );
  assert.equal(writes[1].options.ifMatch, 'remote-v2');
  // Replaying the same outcome against a server that already records its id is a no-op.
  globalThis.window.mobius.storage.getWithVersion = async () => ({
    value: writes[1].value,
    version: 'remote-v3',
  });
  assert.equal(await listener({
    path: queued.path,
    refusedValue: queued.value,
    conflictContext: queued.options.conflictContext,
  }), true);
  assert.equal(writes.length, 2);
});

test('an ordered day-intent batch preserves multiple edits and a reversal', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  let listener;
  const writes = [];
  const context = {
    kind: 'mobius-conflict-context-batch',
    version: 1,
    items: [
      { kind: 'habits-day-entry', id: 'walk-on', habitId: 'walk', operation: 'set', value: 1 },
      { kind: 'habits-day-entry', id: 'run-on', habitId: 'run', operation: 'set', value: 1 },
      { kind: 'habits-day-entry', id: 'walk-off', habitId: 'walk', operation: 'delete' },
    ],
  };
  globalThis.window = {
    mobius: {
      storage: {
        onConflict(cb) { listener = cb; return () => {}; },
        async getWithVersion() { return { value: { read: 1 }, version: 'remote-v2' }; },
        async durableWrite(path, value, options) {
          writes.push({ path, value, options });
          return { durability: 'synced' };
        },
      },
    },
  };

  await setEntry('2026-09-24', 'bootstrap', 1);
  writes.length = 0;
  assert.equal(await listener({
    path: 'logs/2026-09-23.json',
    refusedValue: { run: 1 },
    conflictContext: context,
  }), true);
  assert.deepEqual(
    Object.fromEntries(Object.entries(writes[0].value).filter(([key]) => key !== '_mobius')),
    { read: 1, run: 1 },
  );
  assert.deepEqual(writes[0].options.conflictContext, context);
});
test('a queued recovery never treats its pending adjustment overlay as server confirmation', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  let listener;
  let phase = 'initial';
  let recovering = false;
  let recoveryWrites = 0;
  const context = {
    kind: 'habits-day-entry', id: 'walk-plus', habitId: 'walk', operation: 'adjust', deltaRaw: 1000,
  };
  globalThis.window = {
    mobius: {
      storage: {
        onConflict(cb) { listener = cb; return () => {}; },
        async getWithVersion() {
          if (phase === 'overlay') return {
            value: { read: 1, walk: 1000, _mobius: { applied: ['walk-plus'] } }, version: 'remote-v2',
          };
          return { value: { read: 1 }, version: 'remote-v3' };
        },
        pendingCount: async () => phase === 'overlay' ? 1 : 0,
        async durableWrite() {
          if (!recovering) return { durability: 'synced' };
          recoveryWrites += 1;
          return { durability: recoveryWrites === 1 ? 'queued' : 'synced' };
        },
      },
    },
  };

  await setEntry('2026-09-24', 'bootstrap', 1);
  const conflict = { path: 'logs/2026-09-23.json', conflictContext: context };
  recovering = true;
  assert.equal(await listener(conflict), false);
  phase = 'overlay';
  assert.equal(await listener(conflict), false);
  assert.equal(recoveryWrites, 1);
  phase = 'refused';
  assert.equal(await listener(conflict), true);
  assert.equal(recoveryWrites, 2);
});

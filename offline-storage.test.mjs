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
      runtimeFeatures: { authoritativeVersionedReads: true },
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

test('older runtimes keep day writes on the non-CAS compatibility path', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  const calls = [];
  globalThis.window = {
    mobius: {
      storage: {
        onConflict() { throw new Error('legacy runtime must not install recovery'); },
        async get() { calls.push('get'); return {}; },
        async set() { calls.push('set'); return { queued: true }; },
        async getWithVersion() { throw new Error('legacy runtime must not use versioned reads'); },
        async durableWrite() { throw new Error('legacy runtime must not use conditional writes'); },
      },
    },
  };
  await setEntry('2026-09-25', 'walk', 1);
  assert.deepEqual(calls, ['get', 'set']);
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
      runtimeFeatures: { authoritativeVersionedReads: true },
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
      runtimeFeatures: { authoritativeVersionedReads: true },
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
      runtimeFeatures: { authoritativeVersionedReads: true },
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
      runtimeFeatures: { authoritativeVersionedReads: true },
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
test('a remounted recovery never treats its queued adjustment overlay as server confirmation', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  let listener;
  let phase = 'initial';
  let recovering = false;
  let recoveryWrites = 0;
  const context = {
    kind: 'habits-day-entry', id: 'walk-plus', habitId: 'walk', operation: 'adjust', deltaRaw: 1000,
  };
  const storage = () => ({
    onConflict(cb) { listener = cb; return () => {}; },
    get: async () => null,
    async getWithVersion() {
      if (phase !== 'confirmed') return { value: { read: 1 }, version: 'remote-v1' };
      return { value: {
        read: 1, walk: 1000, _mobius: { applied: ['walk-plus'] },
      }, version: 'remote-v2' };
    },
    pendingCount: async () => { throw new Error('recovery must not race a separate queue count') },
    async durableWrite() {
      if (!recovering) return { durability: 'synced' };
      recoveryWrites += 1;
      return { durability: phase === 'confirmed' ? 'synced' : 'queued' };
    },
  });
  globalThis.window = {
    mobius: {
      runtimeFeatures: { authoritativeVersionedReads: true },
      storage: storage(),
    },
  };

  await setEntry('2026-09-24', 'bootstrap', 1);
  const conflict = { path: 'logs/2026-09-23.json', conflictContext: context };
  recovering = true;
  assert.equal(await listener(conflict), false);
  phase = 'queued';
  // A new frame has no in-memory recovery state, but its queued overlay still
  // cannot be used as proof that the server accepted the adjustment.
  globalThis.window.mobius.storage = storage();
  await getDayLog('2026-09-23');
  assert.equal(await listener(conflict), false);
  assert.equal(recoveryWrites, 2);
  phase = 'confirmed';
  assert.equal(await listener(conflict), true);
  assert.equal(recoveryWrites, 2);
});

test('history reload reads only day files whose modified_at or size changed', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  const days = new Map([
    ['logs/2030-01-01.json', { stamp: 't1', log: { walk: 1 } }],
    ['logs/2030-01-02.json', { stamp: 't1', log: { read: 1 } }],
  ]);
  const gets = [];
  globalThis.window = {
    mobius: {
      online: true,
      storage: {
        listWithStatus: async () => ({
          complete: true,
          source: 'server',
          entries: [...days].map(([path, day]) => ({
            name: path.slice(5), path, type: 'file', modified_at: day.stamp, size: 12,
          })),
        }),
        get: async (path) => { gets.push(path); return days.get(path)?.log ?? null; },
        set: async (path, value) => {
          days.set(path, { stamp: 'local', log: value });
          return { queued: false };
        },
      },
    },
  };

  await loadAllLogs();
  assert.deepEqual(gets.sort(), ['logs/2030-01-01.json', 'logs/2030-01-02.json']);

  gets.length = 0;
  days.set('logs/2030-01-02.json', { stamp: 't2', log: { read: 2 } });
  assert.deepEqual(await loadAllLogs(), { '2030-01-01': { walk: 1 }, '2030-01-02': { read: 2 } });
  assert.deepEqual(gets, ['logs/2030-01-02.json']);

  gets.length = 0;
  await setEntry('2030-01-01', 'walk', 3);
  // The server stamp has not moved yet (e.g. the write is still queued).
  days.set('logs/2030-01-01.json', { stamp: 't1', log: { walk: 3 } });
  gets.length = 0;
  assert.deepEqual((await loadAllLogs())['2030-01-01'], { walk: 3 });
  assert.deepEqual(gets, ['logs/2030-01-01.json'], 'a day written here is never served from the listing cache');
});

test('history uses day bodies inlined by an includeContent listing', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  globalThis.window = {
    mobius: {
      online: true,
      storage: {
        listWithStatus: async (_prefix, options) => ({
          complete: true,
          source: 'server',
          entries: [{
            name: '2030-02-01.json', path: 'logs/2030-02-01.json', type: 'file',
            ...(options?.includeContent ? { content: { walk: 5, _mobius: { version: 1, applied: [] } } } : {}),
          }],
        }),
        get: async () => { throw new Error('inline bodies must not be read again'); },
      },
    },
  };
  assert.deepEqual(await loadAllLogs(), { '2030-02-01': { walk: 5 } });
});

test('a history reload that overlaps a day write does not cache what it read', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  const path = 'logs/2030-03-01.json';
  const days = new Map([[path, { walk: 1 }]]);
  const gets = [];
  let duringRead = null;
  globalThis.window = {
    mobius: {
      online: true,
      storage: {
        // The server stamp stays the same, as it does while the write is queued.
        listWithStatus: async () => ({
          complete: true,
          source: 'server',
          entries: [{ name: '2030-03-01.json', path, type: 'file', modified_at: 't1', size: 12 }],
        }),
        get: async (p) => {
          gets.push(p);
          const value = days.get(p) ?? null;
          const hook = duringRead;
          duringRead = null;
          if (hook) await hook();
          return value;
        },
        set: async (p, value) => { days.set(p, value); return { queued: true }; },
      },
    },
  };

  duringRead = () => setEntry('2030-03-01', 'walk', 4);
  await loadAllLogs();
  gets.length = 0;
  assert.deepEqual((await loadAllLogs())['2030-03-01'], { walk: 4 });
  assert.deepEqual(gets, [path], 'the overlapping reload did not cache the pre-write day');
});

// A day whose write is held open while history reloads. The listing never
// carries content and its server stamp never moves, as while a write is queued.
let heldWriteModule = 0;
async function heldDayWrite(t, { versioned }) {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  // A fresh module per case, so no earlier history cache or listener leaks in.
  const api = await import(`./storage.js?held-write=${++heldWriteModule}`);
  const date = '2030-05-01';
  const path = `logs/${date}.json`;
  let day = { walk: 1 };
  let releaseWrite;
  const writeHeld = new Promise((resolve) => { releaseWrite = resolve; });
  let writeStarted;
  const started = new Promise((resolve) => { writeStarted = resolve; });
  let conflictListener = null;
  const gets = [];
  const commit = async (value) => {
    writeStarted();
    await writeHeld;
    day = structuredClone(value);
  };
  globalThis.window = {
    mobius: {
      online: true,
      runtimeFeatures: { authoritativeVersionedReads: versioned },
      storage: {
        listWithStatus: async () => ({
          complete: true,
          source: 'server',
          entries: [{ name: `${date}.json`, path, type: 'file', modified_at: 't1', size: 12 }],
        }),
        get: async (p) => {
          if (p !== path) return null;
          gets.push(p);
          return structuredClone(day);
        },
        set: async (p, value) => {
          if (p === path) await commit(value);
          return { queued: true };
        },
        getWithVersion: async () => ({ value: structuredClone(day), version: 'v1' }),
        durableWrite: async (_p, value) => { await commit(value); return { durability: 'queued' }; },
        onConflict: (listener) => { conflictListener = listener; return () => {}; },
        subscribe: () => () => {},
      },
    },
  };
  return { api, date, path, gets, started, releaseWrite, conflict: () => conflictListener };
}

for (const versioned of [false, true]) {
  test(`history reloaded during a pending day write shows the written day afterwards (${versioned ? 'versioned' : 'legacy'})`, async (t) => {
    const f = await heldDayWrite(t, { versioned });
    const write = f.api.setEntry(f.date, 'walk', 4);
    await f.started;
    assert.deepEqual((await f.api.loadAllLogs())[f.date], { walk: 1 });
    f.releaseWrite();
    await write;

    f.gets.length = 0;
    assert.deepEqual((await f.api.loadAllLogs())[f.date], { walk: 4 });
    assert.deepEqual(f.gets, [f.path], 'the pre-write body read during the write is not reused');
    f.gets.length = 0;
    await f.api.loadAllLogs();
    assert.deepEqual(f.gets, [], 'a settled day is cached again');
  });
}

test('history reloaded during a conflict recovery write shows the recovered day afterwards', async (t) => {
  const f = await heldDayWrite(t, { versioned: true });
  await f.api.loadAllLogs(); // registers conflict recovery and caches the day
  const recovery = f.conflict()({
    path: f.path,
    conflictContext: { kind: 'habits-day-entry', id: 'recover-1', habitId: 'walk', operation: 'set', value: 4 },
  });
  await f.started;
  assert.deepEqual((await f.api.loadAllLogs())[f.date], { walk: 1 });
  f.releaseWrite();
  await recovery;

  f.gets.length = 0;
  assert.deepEqual((await f.api.loadAllLogs())[f.date], { walk: 4 });
  assert.deepEqual(f.gets, [f.path]);
});

test('deleting a habit purges it from a day written while history was reloading', async (t) => {
  const f = await heldDayWrite(t, { versioned: false });
  const write = f.api.setEntry(f.date, 'read', 2);
  await f.started;
  await f.api.loadAllLogs(); // reads { walk: 1 } while the write is pending
  f.releaseWrite();
  await write;

  const purged = [];
  const set = globalThis.window.mobius.storage.set;
  globalThis.window.mobius.storage.set = async (p, value) => {
    if (p.startsWith('logs/')) purged.push(p);
    return set(p, value);
  };
  await f.api.purgeHabit('read');
  assert.deepEqual(purged, [f.path], 'the purge saw the day that now holds the habit');
});

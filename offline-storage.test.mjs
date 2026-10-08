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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Fresh modules keep each race independent of any earlier history cache or
// conflict listener. No wall-clock delays, real storage, or network are needed.
let raceModule = 0;
async function historyRace(t, { versioned, phase = 'write', rejected = false }) {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  const api = await import(`./storage.js?history-race=${++raceModule}`);
  const date = '2030-04-01';
  const path = `logs/${date}.json`;
  const entered = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  const error = new Error('mock write refused');
  let log = { walk: 1 };
  let listener;
  let holdRead = phase === 'read';
  const gets = [];
  const read = async () => {
    const value = structuredClone(log);
    if (holdRead) {
      holdRead = false;
      entered.resolve();
      await release.promise;
    }
    return value;
  };
  const write = async (value) => {
    if (phase === 'write') {
      entered.resolve();
      await release.promise;
    }
    // A refusal can expose the winner after a provisional overlay is removed.
    log = rejected ? { walk: 9 } : structuredClone(value);
    if (rejected) throw error;
  };
  const storage = {
    listWithStatus: async () => ({
      complete: true, source: 'server',
      // Deliberately no inline content; queued writes leave these unchanged.
      entries: [{ name: `${date}.json`, path, type: 'file', modified_at: 'server-t1', size: 10 }],
    }),
    get: async (p) => { gets.push(p); return read(); },
    set: async (_p, value) => { await write(value); return { queued: true }; },
    subscribe() { return () => {}; },
    onConflict(cb) { listener = cb; return () => {}; },
    getWithVersion: async () => ({ value: await read(), version: 'server-v1' }),
    durableWrite: async (_p, value) => { await write(value); return { durability: 'queued' }; },
  };
  globalThis.window = { mobius: {
    online: true, storage,
    runtimeFeatures: { authoritativeVersionedReads: versioned },
  } };
  return { api, date, path, storage, entered, release, gets, error,
    listener: () => listener, expected: rejected ? 9 : 4 };
}

for (const versioned of [false, true]) {
  for (const rejected of [false, true]) {
    for (const order of ['mutation-first', 'reload-first']) {
      test(`history invalidates on ${rejected ? 'refused' : 'queued'} write settlement (${versioned ? 'CAS' : 'legacy'}, ${order})`, async (t) => {
        const f = await historyRace(t, { versioned, rejected });
        let readEntered;
        let readRelease;
        if (order === 'reload-first') {
          readEntered = deferred();
          readRelease = deferred();
          t.after(() => readRelease.resolve());
          const get = f.storage.get;
          let first = true;
          f.storage.get = async (p) => {
            const value = await get(p);
            if (first) {
              first = false;
              readEntered.resolve();
              await readRelease.promise;
            }
            return value;
          };
        }
        const reload = order === 'reload-first' ? f.api.loadAllLogs() : null;
        if (readEntered) await readEntered.promise;
        const settled = f.api.setEntry(f.date, 'walk', 4).then(
          (value) => ({ value }), (error) => ({ error }),
        );
        await f.entered.promise;
        let during;
        if (reload) {
          readRelease.resolve();
          during = await reload;
        } else during = await f.api.loadAllLogs();
        // Complete the reload while the write is still pending, then settle it.
        f.release.resolve();
        const result = await settled;
        assert.deepEqual(during[f.date], { walk: 1 });
        if (rejected) assert.equal(result.error, f.error);
        else assert.deepEqual(result.value, { walk: 4 });
        f.gets.length = 0;
        assert.deepEqual((await f.api.loadAllLogs())[f.date], { walk: f.expected });
        assert.deepEqual(f.gets, [f.path], 'unchanged stamps cannot retain a pre-settlement body');
        f.gets.length = 0;
        await f.api.loadAllLogs();
        assert.deepEqual(f.gets, [], 'settled unchanged history still benefits from caching');
      });
    }
  }

  test(`history invalidation spans the asynchronous day read (${versioned ? 'CAS' : 'legacy'})`, async (t) => {
    const f = await historyRace(t, { versioned, phase: 'read' });
    const write = f.api.setEntry(f.date, 'walk', 4);
    await f.entered.promise;
    const during = await f.api.loadAllLogs();
    f.release.resolve();
    await write;
    assert.deepEqual(during[f.date], { walk: 1 });
    assert.deepEqual((await f.api.loadAllLogs())[f.date], { walk: 4 });
  });
}

for (const rejected of [false, true]) {
  for (const phase of ['read', 'write']) {
    test(`async recovery invalidates history on ${rejected ? 'failure' : 'queued settlement'} (${phase} suspended)`, async (t) => {
      const f = await historyRace(t, { versioned: true, phase, rejected });
      // Register recovery without changing the log or consuming its first read.
      f.api.subscribeDayLog(f.date, () => {});
      const settled = f.listener()({ path: f.path, conflictContext: {
        kind: 'habits-day-entry', id: 'recovery-set', habitId: 'walk', operation: 'set', value: 4,
      } }).then((value) => ({ value }), (error) => ({ error }));
      await f.entered.promise;
      const during = await f.api.loadAllLogs();
      f.release.resolve();
      const result = await settled;
      assert.deepEqual(during[f.date], { walk: 1 });
      if (rejected) assert.equal(result.error, f.error);
      else assert.equal(result.value, false, 'queued recovery is not server acceptance');
      f.gets.length = 0;
      assert.deepEqual((await f.api.loadAllLogs())[f.date], { walk: f.expected });
      assert.deepEqual(f.gets, [f.path]);
    });
  }
}

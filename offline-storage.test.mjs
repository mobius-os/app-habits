import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { adjustEntry, loadHabits, saveHabits } from './storage.js';

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
    assert.deepEqual(values.get('logs/2026-07-16.json'), { walk: 2000 });
    assert.deepEqual(calls, [
      'habits.json',
      'logs/2026-07-16.json',
      'logs/2026-07-16.json',
    ]);
  } finally {
    delete globalThis.window;
  }
});

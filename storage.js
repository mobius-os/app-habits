// Data layer over window.mobius.storage for the Habits app.
//
// Layout:
//   habits.json            -> Habit[]            (small, single array)
//   logs/<YYYY-MM-DD>.json  -> { habitId: value, _mobius: intent metadata }
// One file per day keeps reads compact. Each mutation also carries a bounded,
// idempotent field intent so disjoint same-day changes from offline devices can
// be replayed over the remote winner instead of replacing the whole day.

const HABITS = 'habits.json';
const logPath = (dateStr) => `logs/${dateStr}.json`;
const TIMERS = 'timers.json';
const DAY_META = '_mobius';
const MAX_APPLIED_DAY_INTENTS = 512;

const conflictContexts = (context) => (
  context?.kind === 'mobius-conflict-context-batch'
  && context?.version === 1 && Array.isArray(context.items)
    ? context.items.flatMap(conflictContexts)
    : [context]
);

function intentId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function publicDayLog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const { [DAY_META]: _meta, ...values } = raw;
  return values;
}

function applyDayIntent(raw, intent) {
  const next = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const previousMeta = next[DAY_META] && typeof next[DAY_META] === 'object' ? next[DAY_META] : {};
  const applied = Array.isArray(previousMeta.applied) ? previousMeta.applied : [];
  if (intent.operation === 'adjust' && applied.includes(intent.id)) return next;
  if (intent.operation === 'delete') delete next[intent.habitId];
  else if (intent.operation === 'adjust') {
    const current = typeof next[intent.habitId] === 'number' && next[intent.habitId] >= 0
      ? next[intent.habitId]
      : 0;
    next[intent.habitId] = Math.max(intent.floor || 0, current + intent.deltaRaw);
  } else next[intent.habitId] = intent.value;
  // Absolute set/delete intents are naturally idempotent and keep the legacy
  // plain day-log shape. Deltas need a bounded applied-id ledger so a replay
  // after frame teardown can never increment the same amount twice.
  if (intent.operation === 'adjust') {
    next[DAY_META] = {
      version: 1,
      applied: [...applied, intent.id].slice(-MAX_APPLIED_DAY_INTENTS),
    };
  }
  return next;
}

let recoveryStorage = null;
let detachRecovery = null;
let recoveredIntents = new Set();
function ensureDayConflictRecovery() {
  const storage = window.mobius?.storage;
  if (storage === recoveryStorage) return;
  try { detachRecovery?.(); } catch {}
  recoveryStorage = storage;
  detachRecovery = null;
  recoveredIntents = new Set();
  if (window.mobius?.runtimeFeatures?.authoritativeVersionedReads !== true
      || !storage?.onConflict || !storage?.getWithVersion || !storage?.durableWrite) return;
  detachRecovery = storage.onConflict(async (conflict) => {
    const context = conflict?.conflictContext;
    const intents = conflictContexts(context);
    if (!/^logs\/\d{4}-\d{2}-\d{2}\.json$/.test(String(conflict?.path || ''))
        || !intents.length || intents.some((intent) => (
          intent?.kind !== 'habits-day-entry' || !intent.id || !intent.habitId
        ))) return false;
    if (intents.every((intent) => recoveredIntents.has(intent.id))) return true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      // Online versioned reads pair the authoritative server document with its
      // ETag. Offline reads can contain a queued overlay and cannot confirm a
      // recovery, even when that overlay already carries the intent id.
      const current = await storage.getWithVersion(conflict.path, 'json');
      if (current?.offline === true) return false;
      const raw = current?.value || {};
      const applied = raw?.[DAY_META]?.applied || [];
      const remaining = intents.filter((intent) => (
        !recoveredIntents.has(intent.id) && !applied.includes(intent.id)
      ));
      if (!remaining.length) {
        for (const intent of intents) recoveredIntents.add(intent.id);
        return true;
      }
      const merged = remaining.reduce(applyDayIntent, raw);
      try {
        const result = await storage.durableWrite(conflict.path, merged, {
          kind: 'json',
          ...(current?.version ? { ifMatch: current.version } : { ifNoneMatch: true }),
          conflictContext: context,
        });
        // A queued recovery is durable but not yet accepted by the server. Do
        // not consume the original conflict or mark its intents recovered;
        // replay will either observe the accepted ids or retry after a second
        // conflict on reconnect.
        if (result?.durability !== 'synced') return false;
        for (const intent of intents) recoveredIntents.add(intent.id);
        return true;
      } catch (error) {
        if (error?.code !== 'conflict') throw error;
      }
    }
    return false;
  });
}

// Local-calendar date string (the user's "today"); domain treats date strings as
// opaque ordered labels, so local-vs-UTC only affects which day a tap lands on.
export function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- habits ---

export async function loadHabits() {
  return (await window.mobius.storage.get(HABITS)) || [];
}

export function subscribeHabits(cb) {
  return window.mobius.storage.subscribe(HABITS, (v) => cb(v || []));
}

export async function saveHabits(habits) {
  await window.mobius.storage.set(HABITS, habits);
}

// Save one form submission while enforcing the timer invariant from the
// REQUESTED final habit, not from a possibly already-persisted previous habit.
// Clearing first makes retry safe across the two files: if the habits write
// fails after cleanup, retry clears again and then finishes the save. A
// disabled habit can therefore never successfully save while retaining a
// hidden running stopwatch that would reappear when re-enabled.
export async function saveHabitsWithTimerPolicy(habits, habit) {
  if (!habit.useTimer) await clearTimerState(habit.id);
  await saveHabits(habits);
  return habits;
}

// --- per-day logs ---

export async function getDayLog(dateStr) {
  ensureDayConflictRecovery();
  return publicDayLog(await window.mobius.storage.get(logPath(dateStr)));
}

export function subscribeDayLog(dateStr, cb) {
  ensureDayConflictRecovery();
  return window.mobius.storage.subscribe(logPath(dateStr), (v) => cb(publicDayLog(v)));
}

// Per-path write queue. window.mobius.storage is last-write-wins and NOT
// transactional, so two concurrent read-modify-writes of the SAME day file race
// (both read the old log, the later write clobbers the earlier habit's entry).
// Serializing per path closes that window: each write reads after the previous
// one for the same path has committed.
const writeChains = {};
function enqueue(path, fn) {
  const prev = writeChains[path] || Promise.resolve();
  const next = prev.then(fn, fn);
  writeChains[path] = next.catch(() => {});
  return next;
}

// Set (or clear, when value is null/undefined) one habit's value for one day.
// Serialized read-modify-write of the single day file; returns the updated log.
export function setEntry(dateStr, habitId, value) {
  return enqueue(logPath(dateStr), async () => {
    const intent = {
      kind: 'habits-day-entry', id: intentId(), habitId,
      operation: value === undefined || value === null ? 'delete' : 'set',
      value,
    };
    return writeDayIntent(dateStr, intent);
  });
}

// Add a signed delta (in stored x1000 units) to a habit's measured amount for
// one day, as a serialized read-modify-write so rapid +/- taps accumulate
// instead of racing on a stale render value — each enqueued adjust reads the
// previous one's committed result. Clamps at `floor` (amounts can't go below 0).
// Returns the updated log.
export function adjustEntry(dateStr, habitId, deltaRaw, floor = 0) {
  return enqueue(logPath(dateStr), async () => {
    return writeDayIntent(dateStr, {
      kind: 'habits-day-entry', id: intentId(), habitId,
      operation: 'adjust', deltaRaw, floor,
    });
  });
}

async function writeDayIntent(dateStr, intent) {
  ensureDayConflictRecovery();
  const storage = window.mobius.storage;
  const path = logPath(dateStr);
  if (window.mobius?.runtimeFeatures?.authoritativeVersionedReads === true
      && storage.getWithVersion && storage.durableWrite && storage.onConflict) {
    const current = await storage.getWithVersion(path, 'json');
    const next = applyDayIntent(current?.value || {}, intent);
    await storage.durableWrite(path, next, {
      kind: 'json',
      ...(current?.version ? { ifMatch: current.version } : { ifNoneMatch: true }),
      conflictContext: intent,
    });
    return publicDayLog(next);
  }
  const current = (await storage.get(path)) || {};
  const next = applyDayIntent(current, intent);
  await storage.set(path, next);
  return publicDayLog(next);
}

// Scrub a habit's id from every day-log when the habit is deleted, so its
// history doesn't linger as orphaned entries (the delete confirm promises this).
// Best-effort and serialized through the same per-path queue.
export async function purgeHabit(habitId) {
  const all = await loadAllLogs();
  if (all !== null) {
    await Promise.all(
      Object.entries(all).map(([dateStr, log]) => {
        if (!Object.prototype.hasOwnProperty.call(log, habitId)) return null;
        return setEntry(dateStr, habitId, null);
      }),
    );
  }
  await clearTimerState(habitId);
}

// --- in-app stopwatch (per timer-enabled habit, "today" only) ---
//
// timers.json -> { [habitId]: { date: 'YYYY-MM-DD', elapsedMs, runningSince } }
// `runningSince` is a wall-clock timestamp (or null when paused), so a
// timer keeps counting correctly across app close/reopen — the displayed
// value is always `elapsedMs + (runningSince ? now - runningSince : 0)`,
// never a value that has to be ticked while the component is unmounted.
// `date` lets a stale timer from a previous day be ignored/reset rather than
// silently crediting today with yesterday's leftover time.

export function subscribeTimers(cb) {
  return window.mobius.storage.subscribe(TIMERS, (v) => cb(v || {}));
}

function currentTimerForDate(all, habitId, date) {
  const current = all[habitId];
  if (!current || current.date !== date) {
    return { date, elapsedMs: 0, runningSince: null };
  }
  const elapsedMs = Number(current.elapsedMs);
  const runningSince = current.runningSince == null ? null : Number(current.runningSince);
  return {
    date,
    elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0,
    runningSince: Number.isFinite(runningSince) ? runningSince : null,
  };
}

// Timer controls submit INTENT, not a patch derived from the last render.
// Each command reads the state left by the previous command inside the timers
// queue, so two immediate toggle taps are start -> pause rather than two stale
// "start" writes.
export function toggleTimerState(habitId, date, nowMs = Date.now()) {
  return enqueue(TIMERS, async () => {
    const all = (await window.mobius.storage.get(TIMERS)) || {};
    const current = currentTimerForDate(all, habitId, date);
    const record = current.runningSince == null
      ? { ...current, runningSince: nowMs }
      : {
        ...current,
        elapsedMs: current.elapsedMs + Math.max(0, nowMs - current.runningSince),
        runningSince: null,
      };
    const next = { ...all, [habitId]: record };
    await window.mobius.storage.set(TIMERS, next);
    return record;
  });
}

// Pause is deliberately idempotent and also reads inside the queue. Completion
// can always issue it, even when a just-tapped start has not rendered yet, and
// use the returned committed elapsed time for the check-in.
export function pauseTimerState(habitId, date, nowMs = Date.now()) {
  return enqueue(TIMERS, async () => {
    const all = (await window.mobius.storage.get(TIMERS)) || {};
    const current = currentTimerForDate(all, habitId, date);
    const record = current.runningSince == null
      ? current
      : {
        ...current,
        elapsedMs: current.elapsedMs + Math.max(0, nowMs - current.runningSince),
        runningSince: null,
      };
    const next = { ...all, [habitId]: record };
    await window.mobius.storage.set(TIMERS, next);
    return record;
  });
}

export function clearTimerState(habitId) {
  return enqueue(TIMERS, async () => {
    const all = (await window.mobius.storage.get(TIMERS)) || {};
    if (!(habitId in all)) return all;
    const { [habitId]: _drop, ...rest } = all;
    await window.mobius.storage.set(TIMERS, rest);
    return rest;
  });
}

// --- history (analytics screens) ---

// Enumerate every day-log and read it into { 'YYYY-MM-DD': { habitId: value } }.
export async function loadAllLogs() {
  const storage = window.mobius.storage;
  ensureDayConflictRecovery();
  const listing = typeof storage.listWithStatus === 'function'
    ? await storage.listWithStatus('logs/')
    : { entries: await storage.list('logs/'), complete: window.mobius?.online !== false };
  // A partial history is useful internally but unsafe as the authoritative
  // analytics/purge input. Keep the previous in-memory view until a complete
  // server or last-known snapshot is available.
  if (!listing || listing.complete !== true) return null;
  const entries = listing.entries || [];
  const out = {};
  let bodiesComplete = true;
  await Promise.all(
    entries
      .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
      .map(async (e) => {
        const dateStr = e.name.replace(/\.json$/, '');
        const log = await window.mobius.storage.get(e.path);
        if (log && typeof log === 'object') out[dateStr] = publicDayLog(log);
        else bodiesComplete = false;
      }),
  );
  return bodiesComplete ? out : null;
}

// Transform day-keyed logs into a per-habit { 'YYYY-MM-DD': value } map, which is
// exactly the shape every domain.js function consumes.
export function entriesForHabit(allLogs, habitId) {
  const out = {};
  for (const [dateStr, log] of Object.entries(allLogs)) {
    if (Object.prototype.hasOwnProperty.call(log, habitId)) out[dateStr] = log[habitId];
  }
  return out;
}

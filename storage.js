// Data layer over window.mobius.storage for the Habits app.
//
// Layout:
//   habits.json            -> Habit[]            (small, single array)
//   logs/<YYYY-MM-DD>.json  -> { habitId: value } (one file per day; last-write-
//                                                   wins per path, so concurrent
//                                                   edits to different days never
//                                                   clobber each other)

const HABITS = 'habits.json';
const logPath = (dateStr) => `logs/${dateStr}.json`;
const TIMERS = 'timers.json';

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
  return (await window.mobius.storage.get(logPath(dateStr))) || {};
}

export function subscribeDayLog(dateStr, cb) {
  return window.mobius.storage.subscribe(logPath(dateStr), (v) => cb(v || {}));
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
    const log = await getDayLog(dateStr);
    const next = { ...log };
    if (value === undefined || value === null) delete next[habitId];
    else next[habitId] = value;
    await window.mobius.storage.set(logPath(dateStr), next);
    return next;
  });
}

// Add a signed delta (in stored x1000 units) to a habit's measured amount for
// one day, as a serialized read-modify-write so rapid +/- taps accumulate
// instead of racing on a stale render value — each enqueued adjust reads the
// previous one's committed result. Clamps at `floor` (amounts can't go below 0).
// Returns the updated log.
export function adjustEntry(dateStr, habitId, deltaRaw, floor = 0) {
  return enqueue(logPath(dateStr), async () => {
    const log = await getDayLog(dateStr);
    const cur = log[habitId];
    const base = typeof cur === 'number' && cur >= 0 ? cur : 0;
    const next = { ...log, [habitId]: Math.max(floor, base + deltaRaw) };
    await window.mobius.storage.set(logPath(dateStr), next);
    return next;
  });
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
        return enqueue(logPath(dateStr), async () => {
          const cur = await getDayLog(dateStr);
          delete cur[habitId];
          await window.mobius.storage.set(logPath(dateStr), cur);
        });
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
  const entries = await window.mobius.storage.list('logs/');
  if (entries === null) return null;
  if (!entries) return {};
  const out = {};
  await Promise.all(
    entries
      .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
      .map(async (e) => {
        const dateStr = e.name.replace(/\.json$/, '');
        const log = await window.mobius.storage.get(e.path);
        if (log && typeof log === 'object') out[dateStr] = log;
      }),
  );
  return out;
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

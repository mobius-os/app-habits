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

// Scrub a habit's id from every day-log when the habit is deleted, so its
// history doesn't linger as orphaned entries (the delete confirm promises this).
// Best-effort and serialized through the same per-path queue.
export async function purgeHabit(habitId) {
  const all = await loadAllLogs();
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

// --- history (analytics screens) ---

// Enumerate every day-log and read it into { 'YYYY-MM-DD': { habitId: value } }.
export async function loadAllLogs() {
  const entries = await window.mobius.storage.list('logs/');
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

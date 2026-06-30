// Pure scoring / streak / frequency / value-encoding logic for the Habits
// mini-app. No React, no I/O, no external deps — so `node --test` runs with
// zero install. Verified against Loop Habit Tracker's algorithm + ScoreTest.kt.
//
// Reconciled from a Claude+Codex ensemble: Claude's implementation is the base
// (correct on the non-daily auto-fill, AT_MOST per-day completion, integer
// currentStreak, and full-range bestStreaks); grafted Codex's AT_MOST score
// seed (S_0 = 1.0); and excluded numerical SKIP from the EMA like boolean SKIP.

// Value encoding shared with storage. NUMERICAL amounts are stored × 1000.
export const VALUE = { UNKNOWN: -1, NO: 0, YES_AUTO: 1, YES_MANUAL: 2, SKIP: 3 };

// EMA constants from Loop's Score.kt. alpha = 0.5^(sqrt(f)/13); base 0.5,
// divisor 13.0. These reproduce the spec's numeric anchors exactly.
const HALF_LIFE_BASE = 0.5;
const HALF_LIFE_DIVISOR = 13.0;

// --- date helpers (UTC, pure string math; no timezone surprises) ---

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatDate(ms) {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAY_MS = 86400000;

// addDays returns the YYYY-MM-DD `n` days after dateStr (n may be negative).
function addDays(dateStr, n) {
  return formatDate(parseDate(dateStr) + n * DAY_MS);
}

// Inclusive count of calendar days from a to b (b >= a).
function daysBetween(aStr, bStr) {
  return Math.round((parseDate(bStr) - parseDate(aStr)) / DAY_MS);
}

// Inclusive ascending list of date strings from -> to.
function dateRange(fromStr, toStr) {
  const out = [];
  for (let ms = parseDate(fromStr); ms <= parseDate(toStr); ms += DAY_MS) {
    out.push(formatDate(ms));
  }
  return out;
}

// Stored value for a date, defaulting to UNKNOWN when the day has no entry.
function valueAt(entriesByDate, dateStr) {
  const v = entriesByDate[dateStr];
  return v === undefined || v === null ? VALUE.UNKNOWN : v;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// --- frequency ---

// f = freqNum/freqDen in (0, 1].
export function frequencyToFloat(habit) {
  return habit.freqNum / habit.freqDen;
}

// EMA decay multiplier alpha. Slower (closer to 1) for rarer habits.
function alphaFor(habit) {
  return Math.pow(HALF_LIFE_BASE, Math.sqrt(frequencyToFloat(habit)) / HALF_LIFE_DIVISOR);
}

// Initial EMA value S_0. AT_MOST habits start fully-satisfied (you have not yet
// exceeded the cap); everything else starts at 0. Grafted from the Codex impl.
function scoreSeed(habit) {
  return habit.type === 'NUMERICAL' && habit.targetType === 'AT_MOST' ? 1 : 0;
}

// --- streak success-day predicate ---

// A "success day" for streak purposes (NOT the EMA — streaks are forgiving):
//  - boolean: value > 0 (YES_AUTO, YES_MANUAL, AND SKIP all count; only NO=0
//    and UNKNOWN=-1 break the chain).
//  - numerical AT_LEAST: logged AND amount >= target.
//  - numerical AT_MOST: logged (not UNKNOWN) AND amount <= target.
export function isSuccess(habit, value) {
  if (habit.type === 'NUMERICAL') {
    if (habit.targetType === 'AT_MOST') {
      return value !== VALUE.UNKNOWN && value / 1000 <= habit.targetValue;
    }
    // AT_LEAST (default)
    return value !== VALUE.UNKNOWN && value / 1000 >= habit.targetValue;
  }
  // boolean
  return value > 0;
}

// --- boolean YES_AUTO auto-fill (Loop's buildCheckmarksFromIntervals) ---
//
// For a non-daily boolean habit you only need `num` manual checks per `den`
// days, so checking 3 of 7 days should read as a fully-satisfied period. Loop
// achieves this by expanding each manual check into an INTERVAL of length
// `den/num` days (the cadence spacing) ending at the check, then snapping those
// intervals backward so adjacent ones don't overlap, and finally marking every
// day inside an interval that isn't a manual check as YES_AUTO. The trailing
// rolling-window count then reads `num` even though only some days were tapped.
//
// `num`/`den` here are already the DOUBLED frequency. Returns a new
// date -> value map covering the window; SKIP and manual checks are never
// overwritten.
function applyAutoFill(entriesByDate, fromStr, toStr, num, den) {
  // Cover a margin before fromStr so an interval anchored just inside the
  // window can still extend leftward into it.
  const dates = dateRange(addDays(fromStr, -(den - 1)), toStr);

  const result = {};
  for (const d of dates) result[d] = valueAt(entriesByDate, d);

  // Length of the interval each manual check expands into (>= 1).
  const intervalLen = Math.max(1, Math.floor(den / num));

  // Manual-check positions (indices into `dates`), most recent first.
  const checks = [];
  for (let i = dates.length - 1; i >= 0; i--) {
    if (result[dates[i]] === VALUE.YES_MANUAL) checks.push(i);
  }

  // Build intervals [begin, end] ending at each check (end = the check day),
  // begin = end - intervalLen + 1. Walking newest -> oldest, snap each begin so
  // it never overlaps the previously-placed (newer) interval.
  let prevBegin = Infinity;
  for (const end of checks) {
    const begin = end - intervalLen + 1;
    let cappedEnd = Math.min(end, prevBegin - 1);
    if (cappedEnd < begin) {
      // Fully shadowed by a newer interval; this check still occupies its day.
      cappedEnd = begin;
    }
    for (let j = Math.max(0, begin); j <= cappedEnd; j++) {
      const cur = result[dates[j]];
      if (cur === VALUE.NO || cur === VALUE.UNKNOWN) result[dates[j]] = VALUE.YES_AUTO;
    }
    prevBegin = begin;
  }
  return result;
}

// --- per-day completion fraction c_t ---

// dayCompletion returns the completion fraction c_t in [0,1] for `dateStr`, OR
// null when the day must be EXCLUDED from the EMA entirely (a SKIP day, boolean
// or numerical) — in which case the score carries forward unchanged (S_t = S_{t-1}).
export function dayCompletion(habit, entriesByDate, dateStr) {
  // SKIP excludes the day from the score for BOTH habit types (Loop semantics).
  if (valueAt(entriesByDate, dateStr) === VALUE.SKIP) return null;
  if (habit.type === 'NUMERICAL') {
    return numericalCompletion(habit, entriesByDate, dateStr);
  }
  return booleanCompletion(habit, entriesByDate, dateStr);
}

function booleanCompletion(habit, entriesByDate, dateStr) {
  let num = habit.freqNum;
  let den = habit.freqDen;
  const f = num / den;

  // Non-daily boolean: double both num and den, and auto-fill YES_AUTO so that
  // satisfying the period (e.g. 3 of 7 days) reads as a full window.
  let entries = entriesByDate;
  if (f < 1) {
    num = num * 2;
    den = den * 2;
    entries = applyAutoFill(entriesByDate, addDays(dateStr, -(den - 1)), dateStr, num, den);
  }

  // Rolling window of the last `den` days; count satisfied days. For the daily
  // case (f==1) only YES_MANUAL counts; for the doubled case, the auto-fill has
  // already promoted gap days to YES_AUTO, so count both manual and auto.
  let sum = 0;
  for (let i = 0; i < den; i++) {
    const v = valueAt(entries, addDays(dateStr, -i));
    if (f < 1) {
      if (v === VALUE.YES_MANUAL || v === VALUE.YES_AUTO) sum++;
    } else if (v === VALUE.YES_MANUAL) {
      sum++;
    }
  }
  return Math.min(1, sum / num);
}

function numericalCompletion(habit, entriesByDate, dateStr) {
  const den = habit.freqDen;
  const target = habit.targetValue;

  if (habit.targetType === 'AT_MOST') {
    // An unlogged day reads as satisfied (you didn't exceed the cap).
    const raw = entriesByDate[dateStr];
    if (raw === undefined || raw === null || raw === VALUE.UNKNOWN) return 1.0;
    const amount = raw / 1000;
    // A cap of 0 ("none is success") can't be scored proportionally — the
    // formula below would divide by zero and poison the EMA with NaN. Exactly
    // zero earns full credit; anything above the cap is a miss.
    if (target <= 0) return amount <= 0 ? 1 : 0;
    // c_t = clamp(1 - (amount - target)/target, 0, 1): full credit at/under the
    // cap, falling to 0 as the amount reaches 2x the cap.
    return clamp(1 - (amount - target) / target, 0, 1);
  }

  // AT_LEAST: rolling window sum over freqDen days, divided by target. UNKNOWN
  // and SKIP are not measurements and are excluded from the sum.
  let sum = 0;
  for (let i = 0; i < den; i++) {
    const raw = entriesByDate[addDays(dateStr, -i)];
    if (raw !== undefined && raw !== null && raw !== VALUE.UNKNOWN && raw !== VALUE.SKIP) {
      sum += raw;
    }
  }
  return Math.min(1, sum / 1000 / target);
}

// --- EMA score series ---

// computeScores returns one {date, score} per day in [fromDateStr, toDateStr],
// inclusive, ascending. The EMA warms up from the earliest logged entry (or the
// window start, whichever is earlier) so a window that starts after the habit
// began still reflects prior history.
export function computeScores(habit, entriesByDate, fromDateStr, toDateStr) {
  const alpha = alphaFor(habit);

  let warmStart = fromDateStr;
  for (const d of Object.keys(entriesByDate)) {
    if (d < warmStart) warmStart = d;
  }

  let S = scoreSeed(habit);
  const out = [];
  for (const date of dateRange(warmStart, toDateStr)) {
    const c = dayCompletion(habit, entriesByDate, date);
    if (c !== null) {
      S = alpha * S + (1 - alpha) * c;
    }
    // else: SKIP day — S carries forward unchanged.
    if (date >= fromDateStr) out.push({ date, score: S });
  }
  return out;
}

// strength = the last EMA score as of asOfDateStr, in [0,1].
export function strength(habit, entriesByDate, asOfDateStr) {
  let warmStart = asOfDateStr;
  for (const d of Object.keys(entriesByDate)) {
    if (d < warmStart) warmStart = d;
  }
  const series = computeScores(habit, entriesByDate, warmStart, asOfDateStr);
  if (series.length === 0) return scoreSeed(habit);
  return series[series.length - 1].score;
}

// --- streaks ---

// Collect all maximal runs of consecutive success-days across the logged range.
// Returns [{start, end, length}] ascending by start.
function allStreaks(habit, entriesByDate, capDate) {
  const dates = Object.keys(entriesByDate).sort();
  if (dates.length === 0) return [];

  const first = dates[0];
  // Ignore stray future-dated entries (clock skew / multi-device) when a cap is
  // given, so a future log can't extend a run past the cap day.
  let last = dates[dates.length - 1];
  if (capDate && last > capDate) last = capDate;
  if (last < first) return [];

  const streaks = [];
  let runStart = null;
  let prev = null;
  for (const date of dateRange(first, last)) {
    const success = isSuccess(habit, valueAt(entriesByDate, date));
    if (success) {
      if (runStart === null) runStart = date;
      prev = date;
    } else if (runStart !== null) {
      streaks.push({ start: runStart, end: prev, length: daysBetween(runStart, prev) + 1 });
      runStart = null;
    }
  }
  if (runStart !== null) {
    streaks.push({ start: runStart, end: prev, length: daysBetween(runStart, prev) + 1 });
  }
  return streaks;
}

// currentStreak = the length of the run ending today (when today is a success),
// or the run ending yesterday when today simply hasn't been logged yet. A run
// that ended earlier than yesterday has lapsed (returns 0), as does an explicit
// miss today. Future-dated entries are ignored (capped at today).
export function currentStreak(habit, entriesByDate, todayStr) {
  const streaks = allStreaks(habit, entriesByDate, todayStr);
  if (streaks.length === 0) return 0;

  const last = streaks[streaks.length - 1];
  if (last.end === todayStr) return last.length;

  // Today not yet logged: a run through yesterday is still in progress. An
  // explicit NO/clear today is NOT "unlogged", so it correctly lapses to 0.
  if (last.end === addDays(todayStr, -1) && valueAt(entriesByDate, todayStr) === VALUE.UNKNOWN) {
    return last.length;
  }
  return 0;
}

// bestStreaks(n) returns the longest `n` streaks, descending by length (ties
// broken by most-recent end first).
export function bestStreaks(habit, entriesByDate, n) {
  const streaks = allStreaks(habit, entriesByDate);
  streaks.sort((a, b) => b.length - a.length || (a.end < b.end ? 1 : -1));
  return streaks.slice(0, n);
}

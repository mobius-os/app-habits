// Today — the home screen. A spacious card per active habit (emoji, name, streak,
// strength ring, big check tile / measurable stepper) plus a gradient hero strip.
// Checking off fires a celebratory confetti burst + a streak toast.

import { useMemo, useState, useRef, useEffect } from 'react';
import { Ring, Confetti, Toast, EmptyState } from './Chrome.jsx';
import { entriesForHabit, subscribeTimers, setTimerState, clearTimerState } from '../storage.js';
import { accent, freqLabel } from '../constants.js';
import { VALUE, isSuccess, strength, currentStreak } from '../domain.js';

function streakMessage(streak) {
  if (streak >= 100) return `💯 ${streak}-day streak!`;
  if (streak >= 50) return `🔥 ${streak} days — incredible!`;
  if (streak >= 30) return `🔥 ${streak}-day streak!`;
  if (streak >= 7) return `🔥 ${streak} days strong!`;
  if (streak >= 1) return `Nice — ${streak} day${streak > 1 ? 's' : ''}!`;
  return 'Done!';
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Live elapsed ms for one habit's timer as of `now`, given its persisted record
// (or none). A record from a previous day (or none at all) reads as zero —
// yesterday's leftover time never silently credits today.
function liveElapsed(rec, today, now) {
  if (!rec || rec.date !== today) return 0;
  const base = rec.elapsedMs || 0;
  return rec.runningSince ? base + (now - rec.runningSince) : base;
}

export function Today({ habits, todayLog, allLogs, today, onSetValue, onAdjust, onOpenDetail }) {
  const [burst, setBurst] = useState(null);     // {id, colors} | null
  const [toast, setToast] = useState(null);
  const [poppedId, setPoppedId] = useState(null); // habit id mid check-pop (transient)
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // In-app stopwatch state for timer-enabled habits: { [habitId]: { date, elapsedMs, runningSince } }.
  const [timerRecs, setTimerRecs] = useState({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timerRecsRef = useRef(timerRecs);
  useEffect(() => { timerRecsRef.current = timerRecs; }, [timerRecs]);
  useEffect(() => subscribeTimers(setTimerRecs), []);
  // Tick once a second, but only while at least one timer for TODAY is running
  // — an idle app with no running stopwatch shouldn't burn a per-second render.
  const anyRunning = useMemo(
    () => Object.values(timerRecs).some((r) => r.date === today && r.runningSince != null),
    [timerRecs, today],
  );
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const active = useMemo(
    () => habits.filter((h) => !h.archived).sort((a, b) => (a.position || 0) - (b.position || 0)),
    [habits],
  );
  const merged = useMemo(() => ({ ...allLogs, [today]: todayLog }), [allLogs, today, todayLog]);

  const stats = useMemo(() => active.map((h) => {
    const entries = entriesForHabit(merged, h.id);
    const value = todayLog[h.id];
    const done = h.type === 'NUMERICAL'
      ? isSuccess(h, value === undefined ? VALUE.UNKNOWN : value)
      : (value === VALUE.YES_MANUAL || value === VALUE.YES_AUTO);
    const timerRec = h.useTimer ? timerRecs[h.id] : undefined;
    const timerElapsedMs = h.useTimer ? liveElapsed(timerRec, today, nowMs) : 0;
    const timerRunning = !!(timerRec && timerRec.date === today && timerRec.runningSince != null);
    return {
      habit: h, value, done,
      strength: strength(h, entries, today),
      streak: currentStreak(h, entries, today),
      entries, timerElapsedMs, timerRunning,
    };
  }), [active, merged, todayLog, today, timerRecs, nowMs]);

  const doneCount = stats.filter((s) => s.done).length;
  const total = active.length;
  const topStreak = stats.reduce((m, s) => Math.max(m, s.streak), 0);
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  function signalDayComplete(wasDone) {
    if (!wasDone && total > 0 && doneCount === total - 1) {
      window.mobius?.signal?.('day_completed', { done: total, total });
    }
  }

  function celebrate(h, projectedStreak) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPoppedId(h.id);
    setBurst({ id: `${h.id}-${Date.now()}`, colors: [accent(h.color), '#f59e0b', '#10b981', '#ffffff'] });
    setToast(streakMessage(projectedStreak));
    timers.current.push(setTimeout(() => setPoppedId(null), 480));
    timers.current.push(setTimeout(() => setBurst(null), 1200));
    timers.current.push(setTimeout(() => setToast(null), 2100));
  }

  async function toggleBool(s) {
    const h = s.habit;
    if (s.value === VALUE.YES_MANUAL || s.value === VALUE.YES_AUTO) {
      await onSetValue(h, null); // clear -> UNKNOWN (a quick un-check; explicit NO/SKIP live in the grid)
    } else {
      const projected = currentStreak(h, { ...s.entries, [today]: VALUE.YES_MANUAL }, today);
      // Only celebrate once the write actually lands — onSetValue resolves falsy
      // on a failed save (which surfaces its own retry banner), so a failed
      // check-in no longer fires confetti as if it succeeded.
      const ok = await onSetValue(h, VALUE.YES_MANUAL);
      if (ok) {
        signalDayComplete(s.done);
        celebrate(h, projected);
      }
    }
  }

  // Relative read-modify-write through the store so rapid +/- taps accumulate
  // instead of racing on the stale render value — each tap adds to the previous
  // serialized result, not to s.value. The store clamps the floor at 0.
  async function stepMeasurable(s, deltaUnits) {
    const h = s.habit;
    const wasDone = s.done;
    const updated = await onAdjust(h, Math.round(deltaUnits * 1000));
    const raw = updated ? updated[h.id] : undefined;
    if (raw != null && isSuccess(h, raw) && !wasDone) {
      signalDayComplete(wasDone);
      celebrate(h, currentStreak(h, { ...s.entries, [today]: raw }, today));
    }
  }

  // Start/pause the in-app stopwatch. `runningSince` is a wall-clock timestamp,
  // so the elapsed time stays correct even if the app is closed and reopened
  // mid-timer — see storage.js.
  async function toggleTimer(s) {
    const h = s.habit;
    await setTimerState(h.id, {
      date: today,
      elapsedMs: s.timerElapsedMs,
      runningSince: s.timerRunning ? null : Date.now(),
    });
  }

  async function resetTimer(s) {
    await clearTimerState(s.habit.id);
  }

  // Reached the target while running: pause, persist the committed elapsed
  // time, and log the actual elapsed minutes as today's value.
  async function completeFromTimer(s) {
    const h = s.habit;
    const wasDone = s.done;
    await setTimerState(h.id, { date: today, elapsedMs: s.timerElapsedMs, runningSince: null });
    const raw = Math.round((s.timerElapsedMs / 60000) * 1000);
    const projected = currentStreak(h, { ...s.entries, [today]: raw }, today);
    const ok = await onSetValue(h, raw);
    if (ok) { signalDayComplete(wasDone); celebrate(h, projected); }
  }

  // The checkmark on a timer habit: unchecks by clearing the log entry, or
  // (when the owner timed it themselves outside the app, or just wants to mark
  // it done early) checks by pausing any running stopwatch and crediting at
  // least the target.
  async function toggleTimerDone(s) {
    const h = s.habit;
    if (s.done) { await onSetValue(h, null); return; }
    const wasDone = s.done;
    if (s.timerRunning) {
      await setTimerState(h.id, { date: today, elapsedMs: s.timerElapsedMs, runningSince: null });
    }
    const minutes = Math.max(s.timerElapsedMs / 60000, h.targetValue || 0);
    const raw = Math.round(minutes * 1000);
    const projected = currentStreak(h, { ...s.entries, [today]: raw }, today);
    const ok = await onSetValue(h, raw);
    if (ok) { signalDayComplete(wasDone); celebrate(h, projected); }
  }

  // Auto-checkoff: once a running timer's elapsed time reaches the habit's
  // target, complete it on its own — re-checked every tick (stats recomputes
  // every second while any timer runs). Guarded so a habit can't be completed
  // twice while its own completion write is still in flight.
  const completingRef = useRef(new Set());
  useEffect(() => {
    stats.forEach((s) => {
      const h = s.habit;
      if (!h.useTimer || !s.timerRunning || s.done) return;
      const targetMs = (h.targetValue || 0) * 60000;
      if (targetMs <= 0 || s.timerElapsedMs < targetMs) return;
      if (completingRef.current.has(h.id)) return;
      completingRef.current.add(h.id);
      completeFromTimer(s).finally(() => completingRef.current.delete(h.id));
    });
  }, [stats]);

  if (total === 0) {
    return (
      <EmptyState
        emoji="🔥"
        title="Build your first habit"
        text="Track anything you want to do regularly — meditation, runs, reading. Tap “+ New” to start a streak."
      />
    );
  }

  return (
    <>
      {burst && <Confetti key={burst.id} colors={burst.colors} />}
      {toast && <Toast text={toast} />}

      <div className="hb-hero">
        <div className="hb-hero-top">
          <div className="hb-hero-count">{doneCount}<small> / {total} done</small></div>
          {topStreak > 0 && <div className="hb-hero-streak">🔥 {topStreak}</div>}
        </div>
        <div className="hb-hero-sub">
          {doneCount === total ? 'All done today — beautiful work.' : `${total - doneCount} to go. Keep the streak alive.`}
        </div>
        <div className="hb-hero-bar"><div className="hb-hero-fill" style={{ transform: `scaleX(${pct / 100})` }} /></div>
      </div>

      {stats.map((s) => {
        const h = s.habit;
        const acc = accent(h.color);
        const isNum = h.type === 'NUMERICAL';
        return (
          <div key={h.id} className={`hb-card${s.done ? ' is-done' : ''}`} style={{ '--hb-accent': acc }}>
            <button
              className="hb-emoji" onClick={() => onOpenDetail(h)} aria-label={`Open ${h.name}`}
              style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
            >{h.emoji}</button>
            <div
              className="hb-card-main" onClick={() => onOpenDetail(h)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(h); } }}
              role="button" tabIndex={0} style={{ cursor: 'pointer' }}
            >
              <div className="hb-card-name">{h.name}</div>
              <div className="hb-card-sub">
                {s.streak > 0 && <span className="hb-streakchip">🔥 {s.streak}</span>}
                <span>{freqLabel(h)}</span>
              </div>
            </div>
            <Ring value={s.strength} accent={acc} />
            {h.useTimer ? (
              <>
                <div className="hb-timer">
                  <div className="hb-timer-col">
                    <span className={`hb-timer-time${s.timerElapsedMs > 0 ? '' : ' is-zero'}`}>
                      {formatClock(s.timerElapsedMs)}
                    </span>
                    <span className="hb-timer-sub">
                      {h.targetValue ? `/ ${h.targetValue} min` : ''}
                    </span>
                    {!s.timerRunning && s.timerElapsedMs > 0 && !s.done && (
                      <button className="hb-timer-reset" onClick={() => resetTimer(s)} aria-label={`Reset ${h.name} timer`}>
                        Reset
                      </button>
                    )}
                  </div>
                  <button
                    className={`hb-timer-play${s.timerRunning ? ' is-running' : ''}`}
                    onClick={() => toggleTimer(s)}
                    aria-label={s.timerRunning ? `Pause ${h.name} timer` : `Start ${h.name} timer`}
                  >{s.timerRunning ? '⏸' : '▶'}</button>
                </div>
                <button
                  className={`hb-check${s.done ? ' is-done' : ''}${poppedId === h.id ? ' pop' : ''}`}
                  onClick={() => toggleTimerDone(s)}
                  aria-label={s.done ? `Mark ${h.name} not done` : `Mark ${h.name} done`} aria-pressed={s.done}
                >{s.done ? '✓' : ''}</button>
              </>
            ) : isNum ? (
              <div className="hb-meas">
                <span className={`hb-meas-val${s.value > 0 ? '' : ' is-zero'}`}>
                  {s.value !== undefined ? +(s.value / 1000).toFixed(2) : 0}
                </span>
                <span className="hb-meas-unit">{h.unit || ''}{h.targetValue ? ` / ${h.targetValue}` : ''}</span>
                <div className="hb-meas-btns">
                  <button className="hb-step" onClick={() => stepMeasurable(s, -1)} aria-label={`Decrease ${h.name}`}>−</button>
                  <button className="hb-step" onClick={() => stepMeasurable(s, 1)} aria-label={`Increase ${h.name}`}>+</button>
                </div>
              </div>
            ) : (
              <button
                className={`hb-check${s.done ? ' is-done' : ''}${poppedId === h.id ? ' pop' : ''}`}
                onClick={() => toggleBool(s)}
                aria-label={s.done ? `Mark ${h.name} not done` : `Mark ${h.name} done`} aria-pressed={s.done}
              >{s.done ? '✓' : ''}</button>
            )}
          </div>
        );
      })}
    </>
  );
}

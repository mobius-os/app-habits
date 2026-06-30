// Today — the home screen. A spacious card per active habit (emoji, name, streak,
// strength ring, big check tile / measurable stepper) plus a gradient hero strip.
// Checking off fires a celebratory confetti burst + a streak toast.

import { useMemo, useState, useRef, useEffect } from 'react';
import { Ring, Confetti, Toast, EmptyState } from './Chrome.jsx';
import { entriesForHabit } from '../storage.js';
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

export function Today({ habits, todayLog, allLogs, today, onSetValue, onAdjust, onOpenDetail }) {
  const [burst, setBurst] = useState(null);     // {colors} | null
  const [toast, setToast] = useState(null);
  const [poppedId, setPoppedId] = useState(null); // habit id mid check-pop (transient)
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

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
    return {
      habit: h, value, done,
      strength: strength(h, entries, today),
      streak: currentStreak(h, entries, today),
      entries,
    };
  }), [active, merged, todayLog, today]);

  const doneCount = stats.filter((s) => s.done).length;
  const total = active.length;
  const topStreak = stats.reduce((m, s) => Math.max(m, s.streak), 0);
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  function celebrate(h, projectedStreak) {
    setPoppedId(h.id);
    setBurst({ colors: [accent(h.color), '#f59e0b', '#10b981', '#ffffff'] });
    setToast(streakMessage(projectedStreak));
    timers.current.push(setTimeout(() => setPoppedId(null), 480));
    timers.current.push(setTimeout(() => setBurst(null), 1200));
    timers.current.push(setTimeout(() => setToast(null), 2100));
  }

  function toggleBool(s) {
    const h = s.habit;
    if (s.value === VALUE.YES_MANUAL || s.value === VALUE.YES_AUTO) {
      onSetValue(h, null); // clear -> UNKNOWN (a quick un-check; explicit NO/SKIP live in the grid)
    } else {
      const projected = currentStreak(h, { ...s.entries, [today]: VALUE.YES_MANUAL }, today);
      onSetValue(h, VALUE.YES_MANUAL);
      celebrate(h, projected);
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
      celebrate(h, currentStreak(h, { ...s.entries, [today]: raw }, today));
    }
  }

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
      {burst && <Confetti colors={burst.colors} />}
      {toast && <Toast text={toast} />}

      <div className="hb-hero">
        <div className="hb-hero-top">
          <div className="hb-hero-count">{doneCount}<small> / {total} done</small></div>
          {topStreak > 0 && <div className="hb-hero-streak">🔥 {topStreak}</div>}
        </div>
        <div className="hb-hero-sub">
          {doneCount === total ? 'All done today — beautiful work.' : `${total - doneCount} to go. Keep the streak alive.`}
        </div>
        <div className="hb-hero-bar"><div className="hb-hero-fill" style={{ width: `${pct}%` }} /></div>
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
            {isNum ? (
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

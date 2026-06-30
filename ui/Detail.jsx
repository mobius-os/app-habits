// Habit detail — themed in the habit's accent color. Streak-led hero, a KPI
// strip, the strength Score curve, monthly History bars, the calendar heatmap
// (tap to backfill), best streaks, and weekday frequency.

import { useMemo, Fragment } from 'react';
import { Ring } from './Chrome.jsx';
import { ScoreChart, HistoryBars } from './Charts.jsx';
import { Heatmap } from './Heatmap.jsx';
import { entriesForHabit } from '../storage.js';
import { accent } from '../constants.js';
import { isSuccess, strength, currentStreak, bestStreaks, computeScores } from '../domain.js';

const MMM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function shift(ds, delta) {
  const [y, m, d] = ds.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
function md(ds) {
  const [, m, d] = ds.split('-').map(Number);
  return `${MMM[m - 1]} ${d}`;
}

export function Detail({ habit, allLogs, todayLog, today, onBack, onEdit, onSetValue, onEditNumber }) {
  const acc = accent(habit.color);
  const merged = useMemo(() => ({ ...allLogs, [today]: todayLog }), [allLogs, today, todayLog]);
  const entries = useMemo(() => entriesForHabit(merged, habit.id), [merged, habit.id]);

  const str = useMemo(() => strength(habit, entries, today), [habit, entries, today]);
  const streak = useMemo(() => currentStreak(habit, entries, today), [habit, entries, today]);
  const best = useMemo(() => bestStreaks(habit, entries, 5), [habit, entries]);
  const bestLen = best.length ? best[0].length : 0;
  const totalDone = useMemo(
    () => Object.entries(entries).filter(([, v]) => isSuccess(habit, v)).length,
    [entries, habit],
  );

  const scoreData = useMemo(
    () => computeScores(habit, entries, shift(today, -89), today).map((p) => ({ label: md(p.date), pct: p.score * 100 })),
    [habit, entries, today],
  );

  const historyData = useMemo(() => {
    const counts = {};
    for (const [date, v] of Object.entries(entries)) {
      if (isSuccess(habit, v)) {
        const key = date.slice(0, 7);
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    const [ty, tm] = today.split('-').map(Number);
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(ty, tm - 1 - i, 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      out.push({ label: MMM[dt.getMonth()], count: counts[key] || 0 });
    }
    return out;
  }, [entries, habit, today]);

  const freq = useMemo(() => {
    const wd = [0, 0, 0, 0, 0, 0, 0];
    for (const [date, v] of Object.entries(entries)) {
      if (isSuccess(habit, v)) {
        const [y, m, d] = date.split('-').map(Number);
        wd[new Date(y, m - 1, d).getDay()] += 1;
      }
    }
    const max = Math.max(1, ...wd);
    return { wd, max };
  }, [entries, habit]);

  const maxStreak = bestLen || 1;

  return (
    <>
      <div className="hb-detail-head" style={{ '--hb-accent': acc }}>
        <button className="hb-back" onClick={onBack} aria-label="Back">‹</button>
        <div className="hb-detail-title" style={{ flex: 1 }}>
          <span className="hb-dt-em">{habit.emoji}</span>
          <h2>{habit.name}</h2>
        </div>
        <button className="hb-back" onClick={onEdit} aria-label="Edit habit">✎</button>
      </div>

      <div className="hb-scroll" style={{ '--hb-accent': acc }}>
        {habit.question && <div className="hb-section-sub" style={{ marginTop: -2 }}>{habit.question}</div>}

        <div className="hb-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 850, color: acc, lineHeight: 1.05 }}>🔥 {streak}</div>
            <div className="hb-section-sub">day streak{bestLen ? ` · best ${bestLen}` : ''}</div>
          </div>
          <Ring value={str} accent={acc} size={66} stroke={7} />
        </div>

        <div className="hb-kpis">
          <div className="hb-kpi"><div className="hb-kpi-big">{Math.round(str * 100)}%</div><div className="hb-kpi-lab">Strength</div></div>
          <div className="hb-kpi"><div className="hb-kpi-big">{bestLen}</div><div className="hb-kpi-lab">Best</div></div>
          <div className="hb-kpi"><div className="hb-kpi-big">{totalDone}</div><div className="hb-kpi-lab">Total</div></div>
        </div>

        <div className="hb-section">
          <h3>Strength</h3>
          <ScoreChart data={scoreData} color={acc} gradId={`hbScore-${habit.id}`} />
        </div>

        <div className="hb-section">
          <h3>History</h3>
          <HistoryBars data={historyData} color={acc} />
        </div>

        <div className="hb-section">
          <h3>Calendar</h3>
          <Heatmap
            habit={habit} entries={entries} today={today}
            onCycle={(date, value) => onSetValue(date, value)}
            onEditNumber={(date) => onEditNumber(date)}
          />
        </div>

        <div className="hb-section">
          <h3>Best streaks</h3>
          {best.length === 0 ? (
            <div className="hb-section-sub">No streaks yet — check in to start one.</div>
          ) : (
            <div className="hb-streaks">
              {best.map((s, i) => (
                <div className="hb-streak-row" key={i}>
                  <div className="hb-streak-bar" style={{ width: `${Math.max(14, (s.length / maxStreak) * 100)}%` }}>{s.length}</div>
                  <span className="hb-streak-dates">{s.start === s.end ? md(s.start) : `${md(s.start)} – ${md(s.end)}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hb-section">
          <h3>Frequency</h3>
          <div className="hb-freq">
            {WDAY.map((label, w) => {
              const ratio = freq.wd[w] / freq.max;
              const size = 6 + Math.round(ratio * 13);
              return (
                <Fragment key={w}>
                  <span className="hb-freq-lab">{label}</span>
                  <div className="hb-freq-dots">
                    <span
                      className="hb-freq-dot"
                      style={{ width: size, height: size, opacity: 0.3 + ratio * 0.7 }}
                      title={`${freq.wd[w]} times`}
                    />
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

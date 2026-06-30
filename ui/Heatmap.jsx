// Calendar heatmap — a GitHub-contributions grid: columns are weeks (oldest to
// newest), rows are weekdays (Sun..Sat). Cells are tinted by outcome. For boolean
// habits, tapping a past cell cycles its value (backfill); numerical is read-only.

import { useMemo } from 'react';
import { VALUE, isSuccess } from '../domain.js';

function fmt(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function Heatmap({ habit, entries, today, weeks = 18, onCycle, onEditNumber }) {
  const acc = `var(--hb-accent)`;
  const cols = useMemo(() => {
    const [ty, tm, td] = today.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    const lastSat = new Date(ty, tm - 1, td + (6 - todayDate.getDay()));
    const out = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        const dt = new Date(lastSat);
        dt.setDate(lastSat.getDate() - w * 7 - (6 - r));
        col.push(fmt(dt));
      }
      out.push(col);
    }
    return out;
  }, [today, weeks]);

  const isBool = habit.type === 'YES_NO';

  function cellStyle(date) {
    const v = entries[date];
    if (v === undefined || v === VALUE.UNKNOWN) return {};
    if (v === VALUE.SKIP) return { background: acc, opacity: 0.35 };
    if (isSuccess(habit, v)) return { background: acc };
    if (v === VALUE.NO) return { background: 'color-mix(in srgb, var(--danger) 30%, transparent)' };
    return {};
  }

  function tapCell(date) {
    if (date > today) return; // can't log the future
    if (!isBool) { if (onEditNumber) onEditNumber(date); return; }
    const cur = entries[date];
    let next;
    if (cur === undefined || cur === VALUE.UNKNOWN) next = VALUE.YES_MANUAL;
    else if (cur === VALUE.YES_MANUAL || cur === VALUE.YES_AUTO) next = VALUE.NO;
    else if (cur === VALUE.NO) next = VALUE.SKIP;
    else next = null;
    onCycle(date, next);
  }

  return (
    <div className="hb-heat">
      {cols.map((col, ci) => (
        <div className="hb-heat-col" key={ci}>
          {col.map((date) => (
            <div
              key={date}
              className={`hb-heat-cell${date > today ? ' is-future' : ''}`}
              style={cellStyle(date)}
              onClick={() => tapCell(date)}
              onKeyDown={date > today ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapCell(date); } }}
              title={date}
              role={date > today ? undefined : 'button'}
              tabIndex={date > today ? undefined : 0}
              aria-label={date > today ? undefined : `Edit ${habit.name} ${date}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

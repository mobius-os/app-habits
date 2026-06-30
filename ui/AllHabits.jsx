// All Habits — Loop's dense multi-day grid, the power-user view. Rows are habits,
// columns are the last 7 days (most recent first). Boolean cells tap-cycle
// (✓ → ✗ → skip → clear); measurable cells show the amount and open the detail.

import { useMemo } from 'react';
import { accent } from '../constants.js';
import { VALUE, isSuccess } from '../domain.js';
import { EmptyState } from './Chrome.jsx';

const DAYS = 7;
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function AllHabits({ habits, allLogs, todayLog, today, onOpenDetail, onSetValue, onEditNumber }) {
  const active = useMemo(
    () => habits.filter((h) => !h.archived).sort((a, b) => (a.position || 0) - (b.position || 0)),
    [habits],
  );
  const cols = useMemo(() => Array.from({ length: DAYS }, (_, i) => shiftDate(today, -i)), [today]);
  const merged = useMemo(() => ({ ...allLogs, [today]: todayLog }), [allLogs, today, todayLog]);

  if (active.length === 0) {
    return <EmptyState emoji="📊" title="No habits yet" text="Add a habit to see your multi-day grid here." />;
  }

  function valueAt(habitId, date) {
    const log = merged[date];
    return log ? log[habitId] : undefined;
  }

  function cycle(h, date, cur) {
    let next;
    if (cur === undefined || cur === VALUE.UNKNOWN) next = VALUE.YES_MANUAL;
    else if (cur === VALUE.YES_MANUAL || cur === VALUE.YES_AUTO) next = VALUE.NO;
    else if (cur === VALUE.NO) next = VALUE.SKIP;
    else next = null; // SKIP -> clear
    onSetValue(h, date, next);
  }

  return (
    <table className="hb-grid">
      <thead>
        <tr>
          <th className="hb-grid-name">Habit</th>
          {cols.map((d) => {
            const [, , dd] = d.split('-').map(Number);
            const wd = new Date(d.slice(0, 4), Number(d.slice(5, 7)) - 1, dd).getDay();
            return <th key={d}>{WD[wd]}<br />{dd}</th>;
          })}
        </tr>
      </thead>
      <tbody>
        {active.map((h) => {
          const acc = accent(h.color);
          const isNum = h.type === 'NUMERICAL';
          return (
            <tr key={h.id} className="hb-grid-row" style={{ '--hb-accent': acc }}>
              <td>
                <button
                  className="hb-grid-habit" onClick={() => onOpenDetail(h)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
                  aria-label={`Open ${h.name}`}
                >
                  <span className="hb-grid-em">{h.emoji}</span>
                  <span className="hb-grid-nm">{h.name}</span>
                </button>
              </td>
              {cols.map((d) => {
                const v = valueAt(h.id, d);
                if (isNum) {
                  const logged = v !== undefined && v > 0;
                  const ok = isSuccess(h, v ?? VALUE.UNKNOWN);
                  return (
                    <td key={d}>
                      <div
                        className={`hb-cell${ok ? ' is-val' : ''}`} onClick={() => onEditNumber(h, d)}
                        role="button" aria-label={`Edit ${h.name} ${d}`}
                      >{logged ? +(v / 1000).toFixed(1) : ''}</div>
                    </td>
                  );
                }
                let cls = '';
                let glyph = '';
                if (v === VALUE.YES_MANUAL || v === VALUE.YES_AUTO) { cls = ' is-yes'; glyph = '✓'; }
                else if (v === VALUE.NO) { cls = ' is-no'; glyph = '✕'; }
                else if (v === VALUE.SKIP) { cls = ' is-skip'; glyph = '–'; }
                return (
                  <td key={d}>
                    <div
                      className={`hb-cell${cls}`} onClick={() => cycle(h, d, v)}
                      role="button" aria-label={`Toggle ${h.name} ${d}`}
                    >{glyph}</div>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

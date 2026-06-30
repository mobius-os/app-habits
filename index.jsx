// Habits — a Möbius mini-app. Spacious "Today" card view (default) + a dense
// "All Habits" grid tab; per-habit detail with the strength score, calendar
// heatmap, best streaks and frequency. Streak-led and celebratory.
//
// This file is the thin shell: storage wiring, tab/detail navigation, and the
// add/edit/delete lifecycle. Screens live under ui/, pure logic in domain.js.

import { useState, useEffect, useCallback, useRef } from 'react';
import { CSS } from './theme.js';
import * as store from './storage.js';
import { todayStr } from './storage.js';
import { Today } from './ui/Today.jsx';
import { AllHabits } from './ui/AllHabits.jsx';
import { Detail } from './ui/Detail.jsx';
import { HabitForm } from './ui/HabitForm.jsx';
import { ConfirmSheet, NumberEntrySheet, AppMark } from './ui/Chrome.jsx';

export default function Habits({ appId, token }) {
  const [today, setToday] = useState(() => todayStr());
  const [habits, setHabits] = useState([]);
  const [todayLog, setTodayLog] = useState({});
  const [allLogs, setAllLogs] = useState({});
  const [tab, setTab] = useState('today');
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(null);          // { mode:'new' } | { mode:'edit', habit } | null
  const [confirmDel, setConfirmDel] = useState(null);
  const [numEntry, setNumEntry] = useState(null);   // { habit, date } | null  (measurable backfill)
  const [online, setOnline] = useState(true);
  const habitsRef = useRef([]);
  const readyFired = useRef(false);

  // habits subscription (live)
  useEffect(() => {
    const u = store.subscribeHabits((list) => { habitsRef.current = list; setHabits(list); });
    return () => { if (u) u(); };
  }, []);

  // today's log subscription — re-bound when `today` rolls over past midnight
  useEffect(() => {
    const u = store.subscribeDayLog(today, setTodayLog);
    return () => { if (u) u(); };
  }, [today]);

  // initial + on-focus full reload of history (catches external / agent writes);
  // app_ready fires once history has actually loaded.
  const reloadAll = useCallback(() => {
    store.loadAllLogs().then((logs) => {
      setAllLogs(logs);
      if (!readyFired.current) {
        readyFired.current = true;
        window.mobius.signal?.('app_ready', { item_count: habitsRef.current.length });
      }
    });
  }, []);
  useEffect(() => { reloadAll(); }, [reloadAll]);

  // midnight rollover + regain-focus refresh: recompute `today` so the first tap
  // after midnight lands on the new day, and re-pull external changes on focus.
  useEffect(() => {
    const tick = () => setToday((prev) => { const t = todayStr(); return prev !== t ? t : prev; });
    const onVis = () => { if (document.visibilityState === 'visible') { tick(); reloadAll(); } };
    const id = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [reloadAll]);

  useEffect(() => {
    const f = () => setOnline(window.mobius?.online !== false);
    f();
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);

  // Write a value, then update local history from the SERIALIZED result rather
  // than re-fetching — this avoids the out-of-order refresh race (a refetch
  // started before an earlier write can land after it and revert state).
  const setValue = useCallback(async (habit, date, value) => {
    const updated = await store.setEntry(date, habit.id, value);
    if (value !== null && value !== undefined) window.mobius.signal?.('item_created', { type: habit.type });
    setAllLogs((prev) => ({ ...prev, [date]: updated }));
    if (date === today) setTodayLog(updated);
  }, [today]);

  // Relative measured-amount adjust (the Today +/- stepper). Goes through the
  // store's serialized read-modify-write so rapid taps accumulate; returns the
  // updated day log so the caller can read the landed value.
  const adjustValue = useCallback(async (habit, date, deltaRaw) => {
    const updated = await store.adjustEntry(date, habit.id, deltaRaw);
    window.mobius.signal?.('item_created', { type: habit.type });
    setAllLogs((prev) => ({ ...prev, [date]: updated }));
    if (date === today) setTodayLog(updated);
    return updated;
  }, [today]);

  const saveHabit = useCallback(async (habit) => {
    const list = habitsRef.current;
    const exists = list.some((h) => h.id === habit.id);
    const next = exists ? list.map((h) => (h.id === habit.id ? habit : h)) : [...list, habit];
    await store.saveHabits(next);
    setForm(null);
  }, []);

  const deleteHabit = useCallback(async (id) => {
    await store.saveHabits(habitsRef.current.filter((h) => h.id !== id));
    await store.purgeHabit(id);   // scrub the habit's id from every day-log
    window.mobius.signal?.('item_deleted');
    setAllLogs((prev) => {
      const copy = {};
      for (const [d, log] of Object.entries(prev)) {
        const { [id]: _drop, ...rest } = log;
        copy[d] = rest;
      }
      return copy;
    });
    setConfirmDel(null); setForm(null); setDetailId(null);
  }, []);

  const detailHabit = habits.find((h) => h.id === detailId);

  return (
    <div className="hb-root">
      <style>{CSS}</style>

      {detailHabit ? (
        <Detail
          habit={detailHabit} allLogs={allLogs} todayLog={todayLog} today={today}
          onBack={() => setDetailId(null)}
          onEdit={() => setForm({ mode: 'edit', habit: detailHabit })}
          onSetValue={(date, value) => setValue(detailHabit, date, value)}
          onEditNumber={(date) => setNumEntry({ habit: detailHabit, date })}
        />
      ) : (
        <>
          <header className="hb-header">
            <div className="hb-brand">
              <AppMark appId={appId} />
              <h1 className="hb-title">Habits</h1>
            </div>
            <button className="hb-add" onClick={() => setForm({ mode: 'new' })}>+ New</button>
          </header>

          <div className="hb-tabs" role="tablist">
            <button className={`hb-tab${tab === 'today' ? ' is-active' : ''}`} onClick={() => setTab('today')} role="tab" aria-selected={tab === 'today'}>Today</button>
            <button className={`hb-tab${tab === 'all' ? ' is-active' : ''}`} onClick={() => setTab('all')} role="tab" aria-selected={tab === 'all'}>All Habits</button>
          </div>

          <div className="hb-scroll">
            {tab === 'today' ? (
              <Today
                habits={habits} todayLog={todayLog} allLogs={allLogs} today={today}
                onSetValue={(h, v) => setValue(h, today, v)}
                onAdjust={(h, deltaRaw) => adjustValue(h, today, deltaRaw)}
                onOpenDetail={(h) => setDetailId(h.id)}
              />
            ) : (
              <AllHabits
                habits={habits} allLogs={allLogs} todayLog={todayLog} today={today}
                onOpenDetail={(h) => setDetailId(h.id)}
                onSetValue={(h, d, v) => setValue(h, d, v)}
                onEditNumber={(h, d) => setNumEntry({ habit: h, date: d })}
              />
            )}
            {!online && <div className="hb-offline" aria-live="polite">● Offline</div>}
          </div>
        </>
      )}

      {form && (
        <HabitForm
          initial={form.mode === 'edit' ? form.habit : null}
          onSave={saveHabit}
          onClose={() => setForm(null)}
          onDelete={form.mode === 'edit' ? () => setConfirmDel(form.habit) : undefined}
        />
      )}

      {confirmDel && (
        <ConfirmSheet
          title={`Delete “${confirmDel.name}”?`}
          body="This removes the habit and all of its history."
          onConfirm={() => deleteHabit(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {numEntry && (
        <NumberEntrySheet
          habit={numEntry.habit} date={numEntry.date}
          current={((numEntry.date === today ? { ...allLogs[numEntry.date], ...todayLog } : allLogs[numEntry.date]) || {})[numEntry.habit.id]}
          onSave={(raw) => { setValue(numEntry.habit, numEntry.date, raw); setNumEntry(null); }}
          onClear={() => { setValue(numEntry.habit, numEntry.date, null); setNumEntry(null); }}
          onClose={() => setNumEntry(null)}
        />
      )}
    </div>
  );
}

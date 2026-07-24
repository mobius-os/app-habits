// Habits — a Möbius mini-app. Spacious "Today" card view (default) + a dense
// "All Habits" grid tab; per-habit detail with the strength score, calendar
// heatmap, best streaks and frequency. Streak-led and celebratory.
//
// This file is the thin shell: storage wiring, tab/detail navigation, and the
// add/edit/delete lifecycle. Screens live under ui/, pure logic in domain.js.

import { Component, useState, useEffect, useCallback, useRef } from 'react';
import { CSS } from './theme.js';
import * as store from './storage.js';
import { todayStr } from './storage.js';
import { Today } from './ui/Today.jsx';
import { AllHabits } from './ui/AllHabits.jsx';
import { Detail } from './ui/Detail.jsx';
import { HabitForm } from './ui/HabitForm.jsx';
import { ConfirmSheet, NumberEntrySheet, AppMark, ErrorBanner } from './ui/Chrome.jsx';
import { currentStreak } from './domain.js';

function signal(name, payload) {
  window.mobius?.signal?.(name, payload);
}

function errorMessage(err) {
  return err && err.message ? String(err.message).slice(0, 140) : 'Unknown error';
}

function reportError(err, source) {
  signal('error', { message: errorMessage(err), source });
}

function closeNavHandle(ref) {
  try { ref.current?.close?.(); } catch {}
  ref.current = null;
}

function logStatus(value) {
  if (value === null || value === undefined) return 'clear';
  if (value === 0) return 'no';
  if (value === 3) return 'skip';
  if (value === 1 || value === 2) return 'yes';
  return 'value';
}

function daysAgo(today, date) {
  const [ty, tm, td] = today.split('-').map(Number);
  const [dy, dm, dd] = date.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td) - new Date(dy, dm - 1, dd)) / 86400000);
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  componentDidCatch(err) {
    reportError(err, 'render');
    this.setState({ failed: true });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="hb-root">
          <style>{CSS}</style>
          <div className="hb-empty">
            <div className="hb-empty-mark" aria-hidden="true">!</div>
            <div className="hb-empty-title">Habits hit an error</div>
            <p className="hb-empty-text">Close and reopen the app to try again.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const [writeError, setWriteError] = useState(null);  // { message, retry } | null
  const habitsRef = useRef([]);
  const readyFired = useRef(false);
  const habitsLoaded = useRef(false);
  const historyLoaded = useRef(false);
  const detailNavRef = useRef(null);
  const formNavRef = useRef(null);
  const confirmNavRef = useRef(null);
  const numEntryNavRef = useRef(null);
  const tabRefs = useRef([]);

  const onTabKeyDown = (event, index) => {
    const order = ['today', 'all'];
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % order.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + order.length) % order.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = order.length - 1;
    else return;
    event.preventDefault();
    setTab(order[nextIndex]);
    window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  };

  const openNavHandle = useCallback(async (ref, label, onBack) => {
    closeNavHandle(ref);
    if (!window.mobius?.nav?.open) return true;
    let handle = null;
    try {
      handle = window.mobius.nav.open(label, onBack);
      ref.current = handle;
      await handle.ready;
      return ref.current === handle;
    } catch (err) {
      if (ref.current === handle) ref.current = null;
      reportError(err, 'nav');
      return false;
    }
  }, []);

  const closeDetail = useCallback(() => {
    closeNavHandle(detailNavRef);
    setDetailId(null);
  }, []);

  const openDetail = useCallback(async (habit) => {
    const ok = await openNavHandle(detailNavRef, 'habits-detail', () => {
      detailNavRef.current = null;
      setDetailId(null);
    });
    if (ok) setDetailId(habit.id);
  }, [openNavHandle]);

  const closeForm = useCallback(() => {
    closeNavHandle(formNavRef);
    setForm(null);
  }, []);

  const openForm = useCallback(async (nextForm) => {
    const ok = await openNavHandle(formNavRef, 'habits-form', () => {
      formNavRef.current = null;
      setForm(null);
    });
    if (ok) setForm(nextForm);
  }, [openNavHandle]);

  const closeConfirm = useCallback(() => {
    closeNavHandle(confirmNavRef);
    setConfirmDel(null);
  }, []);

  const openConfirm = useCallback(async (habit) => {
    const ok = await openNavHandle(confirmNavRef, 'habits-confirm-delete', () => {
      confirmNavRef.current = null;
      setConfirmDel(null);
    });
    if (ok) setConfirmDel(habit);
  }, [openNavHandle]);

  const closeNumEntry = useCallback(() => {
    closeNavHandle(numEntryNavRef);
    setNumEntry(null);
  }, []);

  const openNumEntry = useCallback(async (habit, date) => {
    const ok = await openNavHandle(numEntryNavRef, 'habits-number-entry', () => {
      numEntryNavRef.current = null;
      setNumEntry(null);
    });
    if (ok) setNumEntry({ habit, date });
  }, [openNavHandle]);

  const maybeReady = useCallback(() => {
    if (!readyFired.current && habitsLoaded.current && historyLoaded.current) {
      readyFired.current = true;
      signal('app_ready', { item_count: habitsRef.current.length });
    }
  }, []);

  // habits subscription (live)
  useEffect(() => {
    const u = store.subscribeHabits((list) => {
      habitsRef.current = list;
      setHabits(list);
      habitsLoaded.current = true;
      maybeReady();
    });
    return () => { if (u) u(); };
  }, [maybeReady]);

  // today's log subscription — re-bound when `today` rolls over past midnight
  useEffect(() => {
    setTodayLog({});
    const u = store.subscribeDayLog(today, setTodayLog);
    return () => { if (u) u(); };
  }, [today]);

  // initial + on-focus full reload of history (catches external / agent writes);
  // app_ready fires once history has actually loaded.
  const reloadAll = useCallback(() => {
    store.loadAllLogs().then((logs) => {
      if (logs === null) {
        reportError(new Error('Unable to list habit history'), 'reloadAll');
        return;
      }
      setAllLogs(logs);
      historyLoaded.current = true;
      maybeReady();
    }).catch((err) => {
      reportError(err, 'reloadAll');
    });
  }, [maybeReady]);
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

  // Every user-initiated write funnels through here. On failure it surfaces a
  // visible, retryable error banner and RESOLVES with `undefined` instead of
  // rethrowing — a rejected write used to escape as an unhandled rejection that
  // left the sheet open with no message and silently dropped the check-in.
  // Keeps the semantic signal('error') emission; callers treat an `undefined`
  // result as "did not land" and skip their success-only side effects.
  const attemptWrite = useCallback(async (source, message, op) => {
    try {
      const result = await op();
      setWriteError(null);
      return result;
    } catch (err) {
      reportError(err, source);
      setWriteError({ message, retry: () => attemptWrite(source, message, op) });
      return undefined;
    }
  }, []);

  // Write a value, then update local history from the SERIALIZED result rather
  // than re-fetching — this avoids the out-of-order refresh race (a refetch
  // started before an earlier write can land after it and revert state).
  const setValue = useCallback((habit, date, value) => attemptWrite(
    'setValue', 'Couldn’t save your check-in.', async () => {
      const baseLogs = { ...allLogs, ...(date === today ? { [today]: { ...(allLogs[today] || {}), ...todayLog } } : {}) };
      const prevStreak = currentStreak(habit, store.entriesForHabit(baseLogs, habit.id), today);
      const updated = await store.setEntry(date, habit.id, value);
      const nextLogs = { ...baseLogs, [date]: updated };
      const nextStreak = currentStreak(habit, store.entriesForHabit(nextLogs, habit.id), today);
      signal('item_updated', { type: 'habit_log', habit_type: habit.type, status: logStatus(value) });
      if (prevStreak > 0 && nextStreak === 0) {
        signal('streak_broken', { habit_type: habit.type, length: prevStreak, freq: `${habit.freqNum}/${habit.freqDen}` });
      }
      const backfillDays = daysAgo(today, date);
      if (backfillDays > 0) signal('backfill_used', { days_ago: backfillDays });
      setAllLogs((prev) => ({ ...prev, [date]: updated }));
      if (date === today) setTodayLog(updated);
      return true;
    },
  ), [allLogs, todayLog, today, attemptWrite]);

  // Relative measured-amount adjust (the Today +/- stepper). Goes through the
  // store's serialized read-modify-write so rapid taps accumulate; returns the
  // updated day log so the caller can read the landed value.
  const adjustValue = useCallback((habit, date, deltaRaw) => attemptWrite(
    'adjustValue', 'Couldn’t save your check-in.', async () => {
      const baseLogs = { ...allLogs, ...(date === today ? { [today]: { ...(allLogs[today] || {}), ...todayLog } } : {}) };
      const prevLog = baseLogs[date] || {};
      const prevValue = prevLog[habit.id];
      const prevStreak = currentStreak(habit, store.entriesForHabit(baseLogs, habit.id), today);
      const updated = await store.adjustEntry(date, habit.id, deltaRaw);
      const nextValue = updated ? updated[habit.id] : undefined;
      if (nextValue !== prevValue) {
        const nextLogs = { ...baseLogs, [date]: updated };
        const nextStreak = currentStreak(habit, store.entriesForHabit(nextLogs, habit.id), today);
        signal('item_updated', { type: 'habit_log', habit_type: habit.type, status: 'value' });
        if (prevStreak > 0 && nextStreak === 0) {
          signal('streak_broken', { habit_type: habit.type, length: prevStreak, freq: `${habit.freqNum}/${habit.freqDen}` });
        }
        const backfillDays = daysAgo(today, date);
        if (backfillDays > 0) signal('backfill_used', { days_ago: backfillDays });
      }
      setAllLogs((prev) => ({ ...prev, [date]: updated }));
      if (date === today) setTodayLog(updated);
      return updated;
    },
  ), [allLogs, todayLog, today, attemptWrite]);

  const saveHabit = useCallback((habit) => attemptWrite(
    'saveHabit', 'Couldn’t save your habit.', async () => {
      const list = habitsRef.current;
      const prev = list.find((h) => h.id === habit.id);
      const exists = !!prev;
      const next = exists ? list.map((h) => (h.id === habit.id ? habit : h)) : [...list, habit];
      // The storage command derives cleanup from the requested FINAL state.
      // If saving habits fails after clearing the timer, retry repeats cleanup
      // instead of skipping it because habits.json already says "off".
      await store.saveHabitsWithTimerPolicy(next, habit);
      if (!exists) {
        signal('item_created', {
          type: 'habit',
          habit_type: habit.type,
          freq: `${habit.freqNum}/${habit.freqDen}`,
          has_reminder: !!habit.reminder,
        });
      }
      closeForm();
    },
  ), [closeForm, attemptWrite]);

  // In-app stopwatch writes (Today's timer). Same visible, retryable-error
  // contract as every other user write — a failed start/pause/reset used to
  // become an unhandled rejection with no recovery UI.
  const toggleTimerState = useCallback((habit, date, nowMs) => attemptWrite(
    'timerToggle', 'Couldn’t save the timer.', () => store.toggleTimerState(habit.id, date, nowMs),
  ), [attemptWrite]);

  const pauseTimerState = useCallback((habit, date, nowMs) => attemptWrite(
    'timerPause', 'Couldn’t save the timer.', () => store.pauseTimerState(habit.id, date, nowMs),
  ), [attemptWrite]);

  const resetTimerState = useCallback((habit) => attemptWrite(
    'timerReset', 'Couldn’t reset the timer.', () => store.clearTimerState(habit.id),
  ), [attemptWrite]);

  const deleteHabit = useCallback((id) => attemptWrite(
    'deleteHabit', 'Couldn’t delete your habit.', async () => {
      await store.saveHabits(habitsRef.current.filter((h) => h.id !== id));
      await store.purgeHabit(id);   // scrub the habit's id from every day-log
      signal('item_deleted', { type: 'habit' });
      setAllLogs((prev) => {
        const copy = {};
        for (const [d, log] of Object.entries(prev)) {
          const { [id]: _drop, ...rest } = log;
          copy[d] = rest;
        }
        return copy;
      });
      closeNavHandle(confirmNavRef);
      closeNavHandle(formNavRef);
      closeNavHandle(detailNavRef);
      setConfirmDel(null); setForm(null); setDetailId(null);
    },
  ), [attemptWrite]);

  const detailHabit = habits.find((h) => h.id === detailId);

  return (
    <ErrorBoundary>
    <div className="hb-root">
      <style>{CSS}</style>

      {detailHabit ? (
        <Detail
          habit={detailHabit} allLogs={allLogs} todayLog={todayLog} today={today}
          onBack={closeDetail}
          onEdit={() => openForm({ mode: 'edit', habit: detailHabit })}
          onSetValue={(date, value) => setValue(detailHabit, date, value)}
          onEditNumber={(date) => openNumEntry(detailHabit, date)}
        />
      ) : (
        <>
          <header className="hb-header">
            <div className="hb-brand">
              <AppMark appId={appId} />
              <h1 className="hb-title">Habits</h1>
            </div>
            <button className="hb-add" onClick={() => openForm({ mode: 'new' })}>+ New</button>
          </header>

          <div className="hb-tabs" role="tablist" aria-label="Habit views">
            <button id="hb-tab-today" ref={(node) => { tabRefs.current[0] = node }} className={`hb-tab${tab === 'today' ? ' is-active' : ''}`} onClick={() => setTab('today')} onKeyDown={(event) => onTabKeyDown(event, 0)} role="tab" aria-selected={tab === 'today'} aria-controls="hb-panel-today" tabIndex={tab === 'today' ? 0 : -1}>Today</button>
            <button id="hb-tab-all" ref={(node) => { tabRefs.current[1] = node }} className={`hb-tab${tab === 'all' ? ' is-active' : ''}`} onClick={() => setTab('all')} onKeyDown={(event) => onTabKeyDown(event, 1)} role="tab" aria-selected={tab === 'all'} aria-controls="hb-panel-all" tabIndex={tab === 'all' ? 0 : -1}>All Habits</button>
          </div>

          <div className="hb-scroll">
            {tab === 'today' ? (
              <div id="hb-panel-today" role="tabpanel" aria-labelledby="hb-tab-today">
                <Today
                  habits={habits} todayLog={todayLog} allLogs={allLogs} today={today}
                  onSetValue={(h, v) => setValue(h, today, v)}
                  onAdjust={(h, deltaRaw) => adjustValue(h, today, deltaRaw)}
                  onOpenDetail={openDetail}
                  onTimerToggle={toggleTimerState}
                  onTimerPause={pauseTimerState}
                  onTimerReset={resetTimerState}
                />
              </div>
            ) : (
              <div id="hb-panel-all" role="tabpanel" aria-labelledby="hb-tab-all">
                <AllHabits
                  habits={habits} allLogs={allLogs} todayLog={todayLog} today={today}
                  onOpenDetail={openDetail}
                  onSetValue={(h, d, v) => setValue(h, d, v)}
                  onEditNumber={openNumEntry}
                />
              </div>
            )}
            {!online && <div className="hb-offline" aria-live="polite">Offline</div>}
          </div>
        </>
      )}

      {form && (
        <HabitForm
          initial={form.mode === 'edit' ? form.habit : null}
          onSave={saveHabit}
          onClose={closeForm}
          onDelete={form.mode === 'edit' ? () => openConfirm(form.habit) : undefined}
        />
      )}

      {confirmDel && (
        <ConfirmSheet
          title={`Delete “${confirmDel.name}”?`}
          body="This removes the habit and all of its history."
          onConfirm={() => deleteHabit(confirmDel.id)}
          onCancel={closeConfirm}
        />
      )}

      {numEntry && (
        <NumberEntrySheet
          habit={numEntry.habit} date={numEntry.date}
          current={((numEntry.date === today ? { ...allLogs[numEntry.date], ...todayLog } : allLogs[numEntry.date]) || {})[numEntry.habit.id]}
          onSave={(raw) => { setValue(numEntry.habit, numEntry.date, raw).then((ok) => { if (ok) closeNumEntry(); }); }}
          onClear={() => { setValue(numEntry.habit, numEntry.date, null).then((ok) => { if (ok) closeNumEntry(); }); }}
          onClose={closeNumEntry}
        />
      )}

      {writeError && (
        <ErrorBanner
          message={writeError.message}
          onRetry={writeError.retry}
          onDismiss={() => setWriteError(null)}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

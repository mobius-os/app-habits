// Add / edit habit — a bottom sheet (never a native dialog; the sandbox has no
// allow-modals). Covers type, target, emoji, accent color, frequency, reminder.

import { useState } from 'react';
import { Sheet } from './Chrome.jsx';
import { todayStr } from '../storage.js';
import {
  EMOJIS, PALETTE, accent, FREQ_PRESETS,
  WEEKDAY_LABELS, EVERY_DAY_MASK, maskHasDay, toggleMaskDay,
} from '../constants.js';

function newId() {
  return (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `h-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

export function HabitForm({ initial, onSave, onClose, onDelete }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [question, setQuestion] = useState(initial?.question || '');
  const [emoji, setEmoji] = useState(initial?.emoji || '🔥');
  const [color, setColor] = useState(initial?.color ?? 5);
  const [type, setType] = useState(initial?.type || 'YES_NO');
  const [targetValue, setTargetValue] = useState(String(initial?.targetValue ?? 1));
  const [targetType, setTargetType] = useState(initial?.targetType || 'AT_LEAST');
  const [unit, setUnit] = useState(initial?.unit || '');
  const [freqIdx, setFreqIdx] = useState(() => {
    const i = FREQ_PRESETS.findIndex((p) => p.freqNum === initial?.freqNum && p.freqDen === initial?.freqDen);
    return i >= 0 ? i : 0;
  });
  const [remindOn, setRemindOn] = useState(!!initial?.reminder);
  const [remindTime, setRemindTime] = useState(() => {
    if (!initial?.reminder) return '09:00';
    const { hour, minute } = initial.reminder;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  });
  const [remindDays, setRemindDays] = useState(initial?.reminder?.days ?? EVERY_DAY_MASK);

  const acc = accent(color);
  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    const preset = FREQ_PRESETS[freqIdx];
    const [h, m] = remindTime.split(':').map(Number);
    onSave({
      id: initial?.id || newId(),
      name: name.trim(),
      question: question.trim(),
      emoji,
      color,
      type,
      targetValue: type === 'NUMERICAL' ? (Number(targetValue) || 1) : undefined,
      targetType: type === 'NUMERICAL' ? targetType : undefined,
      unit: type === 'NUMERICAL' ? unit.trim() : undefined,
      freqNum: preset.freqNum,
      freqDen: preset.freqDen,
      reminder: remindOn ? { hour: h || 0, minute: m || 0, days: remindDays } : null,
      position: initial?.position ?? Date.now(),
      archived: initial?.archived || false,
      created: initial?.created || todayStr(),
    });
  }

  return (
    <Sheet title={editing ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <div className="hb-field">
        <input
          className="hb-input" placeholder="Habit name (e.g. Meditate)" value={name}
          onChange={(e) => setName(e.target.value)} autoFocus aria-label="Habit name"
        />
      </div>

      <div className="hb-field">
        <label className="hb-label">Type</label>
        <div className="hb-seg" role="group" aria-label="Habit type">
          <button className={type === 'YES_NO' ? 'is-active' : ''} onClick={() => setType('YES_NO')}>Yes / No</button>
          <button className={type === 'NUMERICAL' ? 'is-active' : ''} onClick={() => setType('NUMERICAL')}>Measurable</button>
        </div>
      </div>

      {type === 'NUMERICAL' && (
        <div className="hb-field">
          <label className="hb-label">Target</label>
          <div className="hb-seg" role="group" aria-label="Target type">
            <button className={targetType === 'AT_LEAST' ? 'is-active' : ''} onClick={() => setTargetType('AT_LEAST')}>At least</button>
            <button className={targetType === 'AT_MOST' ? 'is-active' : ''} onClick={() => setTargetType('AT_MOST')}>At most</button>
          </div>
          <div className="hb-row" style={{ marginTop: 8 }}>
            <input
              className="hb-input" type="number" inputMode="decimal" value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)} aria-label="Target value"
            />
            <input
              className="hb-input" placeholder="unit (km, pages…)" value={unit}
              onChange={(e) => setUnit(e.target.value)} aria-label="Unit"
            />
          </div>
        </div>
      )}

      <div className="hb-field">
        <label className="hb-label">Icon</label>
        <div className="hb-emoji-grid">
          {EMOJIS.map((e) => (
            <button
              key={e} className={`hb-emoji-cell${e === emoji ? ' is-active' : ''}`}
              onClick={() => setEmoji(e)} aria-label={`Icon ${e}`}
            >{e}</button>
          ))}
        </div>
      </div>

      <div className="hb-field">
        <label className="hb-label">Color</label>
        <div className="hb-pal-grid">
          {PALETTE.map((hex, i) => (
            <button
              key={hex} className={`hb-pal-cell${i === color ? ' is-active' : ''}`}
              style={{ background: hex }} onClick={() => setColor(i)} aria-label={`Color ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="hb-field">
        <label className="hb-label">How often</label>
        <select className="hb-input" value={freqIdx} onChange={(e) => setFreqIdx(Number(e.target.value))} aria-label="Frequency">
          {FREQ_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
        </select>
      </div>

      <div className="hb-field">
        <label className="hb-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Reminder</span>
          <input type="checkbox" checked={remindOn} onChange={(e) => setRemindOn(e.target.checked)} aria-label="Enable reminder" />
        </label>
        {remindOn && (
          <>
            <input
              className="hb-input" type="time" value={remindTime}
              onChange={(e) => setRemindTime(e.target.value)} aria-label="Reminder time"
            />
            <div className="hb-week" style={{ marginTop: 8 }}>
              {WEEKDAY_LABELS.map((d, i) => (
                <button
                  key={i} className={maskHasDay(remindDays, i) ? 'is-on' : ''}
                  onClick={() => setRemindDays(toggleMaskDay(remindDays, i))}
                  aria-label={`Toggle weekday ${i}`} aria-pressed={maskHasDay(remindDays, i)}
                >{d}</button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="hb-sheet-actions">
        {editing && onDelete && (
          <button className="hb-btn hb-btn-danger" onClick={onDelete} aria-label="Delete habit">Delete</button>
        )}
        <button className="hb-btn hb-btn-primary" onClick={save} disabled={!canSave}>
          {editing ? 'Save' : 'Add habit'}
        </button>
      </div>
    </Sheet>
  );
}

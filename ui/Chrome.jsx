// Shared, reusable UI blocks for the Habits app. Kept in one file per the Möbius
// convention so a future library extraction is a grep-and-move. Color comes from
// theme tokens; per-habit accent is passed as the `--hb-accent` CSS var.

import { useMemo, useState, useEffect, useRef } from 'react';
import { X } from '@openai/apps-sdk-ui/components/Icon';

let sheetTitleSeq = 0;

// The app's own installed icon, rounded and sized to the header. Falls back to
// an emoji mark before the icon route exists (a fresh dev render, or a 404 on a
// brand-new install) so the header never shows a broken image. Matches the
// brand-icon pattern the other Möbius apps use.
export function AppMark({ appId, fallback = '🔥' }) {
  const [failed, setFailed] = useState(false);
  if (failed || !appId) {
    return <span className="hb-mark" aria-hidden="true">{fallback}</span>;
  }
  return (
    <img
      className="hb-mark hb-mark-img" src={`/api/apps/${appId}/icon?size=128`}
      alt="" aria-hidden="true" onError={() => setFailed(true)}
    />
  );
}

// Tracks the visual viewport so a bottom sheet can stay pinned directly above
// the soft keyboard. The app-frame's viewport meta has no
// `interactive-widget=resizes-content`, so opening the keyboard does NOT shrink
// the layout viewport — a bottom-anchored sheet would sit behind the keyboard
// and the browser would scroll-jump the page to reveal the focused input. We
// size the scrim to window.visualViewport (offsetTop + height) instead, the
// same viewport signal app-atlas relies on. Returns null where unsupported, so
// the CSS `inset: 0` fallback applies unchanged.
function useVisualViewport() {
  const [vp, setVp] = useState(null);
  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!v) return undefined;
    const sync = () => setVp({ top: Math.max(0, v.offsetTop), height: v.height });
    sync();
    v.addEventListener('resize', sync);
    v.addEventListener('scroll', sync);
    return () => { v.removeEventListener('resize', sync); v.removeEventListener('scroll', sync); };
  }, []);
  return vp;
}

/* mobius-ui:Ring v1 — strength/progress ring; library candidate. */
export function Ring({ value, size = 46, stroke = 5, accent, showLabel = true }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v);
  const style = accent ? { '--hb-accent': accent } : undefined;
  return (
    <svg className="hb-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style} aria-hidden="true">
      <circle className="hb-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className="hb-ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {showLabel && (
        <text className="hb-ring-label" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
          {Math.round(v * 100)}
        </text>
      )}
    </svg>
  );
}
/* /mobius-ui:Ring */

/* mobius-ui:Sheet v1 — bottom sheet (the app's dialog; no native modals). */
export function Sheet({ title, onClose, children }) {
  const vp = useVisualViewport();
  const sheetRef = useRef(null);
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const titleId = useMemo(() => `hb-sheet-title-${sheetTitleSeq++}`, []);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet && !sheet.contains(document.activeElement)) {
      sheet.querySelector(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )?.focus();
    }
    return () => {
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = sheetRef.current?.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  // Pin the scrim (and so the bottom-anchored sheet) to the visible region
  // above the keyboard; otherwise fall back to the CSS `inset: 0`.
  const scrimStyle = vp
    ? { top: `${vp.top}px`, height: `${vp.height}px`, bottom: 'auto' }
    : undefined;
  return (
    <div className="hb-scrim" style={scrimStyle} onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="hb-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hb-sheet-grip" aria-hidden="true" />
        {title && <h3 className="hb-sheet-title" id={titleId}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
/* /mobius-ui:Sheet */

/* mobius-ui:Empty v1 — 3-part empty state; library candidate. */
export function EmptyState({ emoji = '✨', title, text }) {
  return (
    <div className="hb-empty">
      <div className="hb-empty-mark" aria-hidden="true">{emoji}</div>
      <div className="hb-empty-title">{title}</div>
      <p className="hb-empty-text">{text}</p>
    </div>
  );
}
/* /mobius-ui:Empty */

// A short celebratory confetti burst, rendered absolutely over the app root.
export function Confetti({ colors = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7'] }) {
  const pieces = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({
      left: 8 + Math.random() * 84,
      top: 28 + Math.random() * 26,
      bg: colors[i % colors.length],
      delay: Math.round(Math.random() * 140),
    })),
    [colors],
  );
  return (
    <div className="hb-burst" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i} className="hb-confetti"
          style={{ left: `${p.left}%`, top: `${p.top}%`, background: p.bg, animationDelay: `${p.delay}ms` }}
        />
      ))}
    </div>
  );
}

export function Toast({ text }) {
  return <div className="hb-toast" role="status">{text}</div>;
}

// Persistent banner for a FAILED write — a check-in / save / delete that didn't
// land. Sits above the sheet layer so a failure inside an open sheet is still
// visible, and offers a Retry so the write isn't silently lost. `role="alert"`
// so it's announced; stays until the user retries (success clears it) or
// dismisses it.
export function ErrorBanner({ message, onRetry, onDismiss }) {
  return (
    <div className="hb-errbar" role="alert">
      <span className="hb-errbar-msg">{message}</span>
      <button type="button" className="hb-errbar-retry" onClick={onRetry}>Retry</button>
      <button type="button" className="hb-errbar-x" onClick={onDismiss} aria-label="Dismiss">
        <X width={16} height={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// Numeric entry sheet — record/backfill a measurable habit's value for a day.
// Allows an explicit 0 (e.g. "0 sodas today"), which is a real, success-earning
// value for AT_MOST habits and distinct from an unlogged day.
export function NumberEntrySheet({ habit, date, current, onSave, onClear, onClose }) {
  const logged = current !== undefined && current !== null && current >= 0;
  const [val, setVal] = useState(logged ? String(current / 1000) : '');
  const trimmed = val.trim();
  const parsed = Number(trimmed);
  const canSave = trimmed !== '' && Number.isFinite(parsed);
  return (
    <Sheet title={`${habit.emoji} ${habit.name}`} onClose={onClose}>
      <div className="hb-section-sub" style={{ margin: 0 }}>{date}</div>
      <input
        className="hb-input" type="number" inputMode="decimal" autoFocus value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={`Amount${habit.unit ? ` (${habit.unit})` : ''}`}
        aria-label={`Amount for ${habit.name}`}
      />
      <div className="hb-sheet-actions">
        {logged && <button type="button" className="hb-btn hb-btn-danger" onClick={onClear}>Clear</button>}
        <button
          type="button"
          className="hb-btn hb-btn-primary"
          onClick={() => { if (canSave) onSave(Math.max(0, Math.round(parsed * 1000))); }}
          disabled={!canSave}
        >Save</button>
      </div>
    </Sheet>
  );
}

// Confirm sheet for destructive actions (no native confirm() in the sandbox).
export function ConfirmSheet({ title, body, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <Sheet title={title} onClose={onCancel}>
      {body && <p className="hb-section-sub" style={{ margin: 0 }}>{body}</p>}
      <div className="hb-sheet-actions">
        <button type="button" className="hb-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="hb-btn hb-btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Sheet>
  );
}

// The Habits app stylesheet — one scoped CSS string rendered once at the root as
// <style>{CSS}</style>. Class prefix `hb-`. Color comes from theme tokens for
// chrome (var(--bg) etc.); per-habit accent is passed via inline style as
// `--hb-accent` so the same classes tint per card. Playful: soft cards, springy
// taps, a celebratory check pop, a gradient hero. Honors prefers-reduced-motion.

export const CSS = `
.hb-root { position: relative; display: flex; flex-direction: column; height: 100%;
  overflow: hidden; background: var(--bg); color: var(--text); font-family: var(--font);
  -webkit-tap-highlight-color: transparent; }
.hb-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

/* Keep the app canvas full-width, but cap the working column on web so
   one-column habit cards stay comfortably scannable. Phones remain full-width. */
.hb-page { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; }
@media (min-width: 760px) {
  .hb-page { max-width: 720px; margin-inline: auto; }
}

/* header */
.hb-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: calc(14px + env(safe-area-inset-top)) 16px 10px; }
.hb-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.hb-mark { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 11px; display: flex;
  align-items: center; justify-content: center; font-size: 19px;
  background: linear-gradient(150deg, #10b981, #f59e0b); box-shadow: 0 4px 14px rgba(16,185,129,0.35); }
/* the real installed icon variant — show the logo itself, no gradient tile */
.hb-mark-img { object-fit: contain; background: none; box-shadow: none; }
.hb-title { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.hb-add { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px;
  border: none; border-radius: 12px; background: var(--accent-hover, var(--accent)); color: var(--accent-fg);
  font-family: var(--font); font-size: 15px; font-weight: 700; cursor: pointer;
  transition: transform .12s ease, filter .12s ease; }
.hb-add:active { transform: scale(0.95); filter: brightness(0.94); }

/* tabs */
.hb-tabs { flex: 0 0 auto; display: flex; gap: 4px; margin: 2px 16px 8px; padding: 4px;
  background: var(--surface2, var(--surface)); border-radius: 12px; }
.hb-tab { flex: 1; min-height: 44px; border: none; background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 14px; font-weight: 700; border-radius: 9px; cursor: pointer;
  transition: background .15s ease, color .15s ease; }
.hb-tab.is-active { background: var(--surface); color: var(--text); box-shadow: 0 1px 4px rgba(0,0,0,0.12); }

/* scroll body */
.hb-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 4px 16px calc(40px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px;
  overscroll-behavior-y: contain; }

/* hero strip */
.hb-hero { position: relative; overflow: hidden; border-radius: 16px; padding: 18px 18px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, #000 0%),
    color-mix(in srgb, var(--accent) 55%, #7c3aed 45%)); color: var(--accent-fg);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--accent) 28%, transparent); }
.hb-hero-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.hb-hero-count { font-size: 30px; font-weight: 850; letter-spacing: -0.02em; line-height: 1; }
.hb-hero-count small { font-size: 16px; font-weight: 700; opacity: 0.85; }
.hb-hero-streak { display: inline-flex; align-items: center; gap: 5px; font-size: 15px; font-weight: 800;
  background: rgba(255,255,255,0.22); padding: 6px 11px; border-radius: 999px; backdrop-filter: blur(4px); }
.hb-hero-sub { margin-top: 4px; font-size: 13px; font-weight: 600; opacity: 0.92; }
.hb-hero-bar { margin-top: 13px; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.25); overflow: hidden; }
.hb-hero-fill { height: 100%; width: 100%; border-radius: 999px; background: var(--accent-fg); transform-origin: left; transition: transform .35s ease-out; }

/* habit card (Today). flex-wrap so a card that doesn't fit on one line at any
   viewport width (a timer habit's ring + stopwatch + check is the widest
   combination) wraps onto a second line instead of overflowing the card —
   see .hb-card-controls just below for the piece that actually wraps. */
.hb-card { display: flex; flex-wrap: wrap; align-items: center; gap: 13px; row-gap: 8px;
  padding: 13px 14px; border-radius: 12px;
  background: var(--surface); border: 1px solid var(--border);
  transition: transform .12s ease, box-shadow .2s ease; }
.hb-card.is-done { box-shadow: 0 4px 18px color-mix(in srgb, var(--hb-accent) 22%, transparent);
  border-color: color-mix(in srgb, var(--hb-accent) 45%, var(--border)); }
.hb-emoji { flex: 0 0 auto; width: 46px; height: 46px; border-radius: 12px; display: flex;
  align-items: center; justify-content: center; font-size: 24px;
  background: color-mix(in srgb, var(--hb-accent) 16%, transparent); }
.hb-card-main { flex: 1; min-width: 0; min-height: 44px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.hb-card-name { font-size: 16px; font-weight: 750; letter-spacing: -0.01em; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hb-card-sub { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 650; color: var(--muted); }
.hb-streakchip { display: inline-flex; align-items: center; gap: 3px;
  color: color-mix(in srgb, var(--hb-accent) 78%, var(--text)); font-weight: 800; }

/* The ring + timer/measure/check cluster is one atomic flex item so it wraps
   to its own full-width row as a unit on narrow phones (see .hb-card above),
   rather than the habit name losing the tug-of-war for space against these
   fixed-width controls and getting squeezed to 0 while the controls overflow
   the card. Wrapped or not, it stays right-aligned. */
.hb-card-controls { display: flex; align-items: center; gap: 13px; flex: 0 0 auto; margin-left: auto; }

/* strength ring */
.hb-ring { flex: 0 0 auto; }
.hb-ring-track { stroke: color-mix(in srgb, var(--hb-accent) 18%, transparent); }
.hb-ring-fill { stroke: var(--hb-accent); stroke-linecap: round;
  transition: stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1); }
.hb-ring-label { font-size: 11px; font-weight: 800; fill: var(--text); }

/* check tile — same size/shape as the +/- step buttons (.hb-step) */
.hb-check { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 10px; border: 1px solid
  color-mix(in srgb, var(--hb-accent) 40%, var(--border)); background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: var(--hb-accent);
  font-size: 18px; font-weight: 800; transition: transform .14s ease-out, background .14s ease; }
.hb-check:active { transform: scale(0.88); }
.hb-check.is-done { background: var(--hb-accent); border-color: var(--hb-accent); color: var(--accent-fg); }
.hb-check.is-skip { border-style: dashed; color: var(--muted); border-color: var(--border); }
.hb-check.pop { animation: hb-pop .26s ease-out; }
@keyframes hb-pop { 0%{transform:scale(.9)} 55%{transform:scale(1.06)} 100%{transform:scale(1)} }

/* measurable quick-entry */
.hb-meas { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 70px; }
.hb-meas-val { font-size: 19px; font-weight: 850; color: var(--hb-accent); line-height: 1; }
.hb-meas-val.is-zero { color: var(--muted); }
.hb-meas-unit { font-size: 11px; font-weight: 650; color: var(--muted); }
.hb-meas-btns { display: flex; gap: 4px; margin-top: 4px; }
.hb-step { min-width: 44px; width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface2, var(--surface)); color: var(--text); font-size: 17px; font-weight: 800;
  cursor: pointer; display: flex; align-items: center; justify-content: center; }
.hb-step:active { transform: scale(0.9); }

/* timer habit — stopwatch + play/pause, paired with the check button */
.hb-timer { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.hb-timer-col { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 46px; }
.hb-timer-time { font-size: 16px; font-weight: 850; color: var(--hb-accent); line-height: 1;
  font-variant-numeric: tabular-nums; }
.hb-timer-time.is-zero { color: var(--muted); }
.hb-timer-sub { font-size: 10.5px; font-weight: 650; color: var(--muted); }
.hb-timer-reset { border: none; background: none; padding: 2px 0; font-size: 11px; font-weight: 650;
  color: var(--muted); text-decoration: underline; cursor: pointer; min-height: 20px; }
.hb-timer-play { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--border);
  background: var(--surface2, var(--surface)); color: var(--hb-accent); font-size: 15px;
  display: flex; align-items: center; justify-content: center; cursor: pointer; }
.hb-timer-play.is-running { background: var(--hb-accent); border-color: var(--hb-accent); color: var(--accent-fg); }
.hb-timer-play:active { transform: scale(0.9); }

/* celebration burst */
.hb-burst { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 60; }
.hb-confetti { position: absolute; width: 9px; height: 9px; border-radius: 2px; will-change: transform, opacity;
  animation: hb-fall 1100ms cubic-bezier(.2,.6,.3,1) forwards; }
@keyframes hb-fall { 0%{transform:translateY(0) rotate(0); opacity:1}
  100%{transform:translateY(160px) rotate(380deg); opacity:0} }
.hb-toast { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
  z-index: 70; background: var(--text); color: var(--bg); font-size: 14px; font-weight: 750;
  padding: 11px 18px; border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  animation: hb-toastin .3s ease, hb-toastout .3s ease 1.7s forwards; }
@keyframes hb-toastin { from{opacity:0; transform:translate(-50%,12px)} to{opacity:1; transform:translate(-50%,0)} }
@keyframes hb-toastout { to{opacity:0; transform:translate(-50%,12px)} }

/* empty state */
.hb-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;
  margin: auto; padding: 52px 24px; color: var(--muted); }
.hb-empty-mark { width: 76px; height: 76px; margin-bottom: 8px; border-radius: 16px; display: flex;
  align-items: center; justify-content: center; font-size: 38px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 22%, transparent),
    color-mix(in srgb, #f59e0b 18%, transparent)); }
.hb-empty-title { font-size: 18px; font-weight: 800; color: var(--text); }
.hb-empty-text { margin: 0; font-size: 14px; line-height: 1.55; max-width: 280px; }

/* bottom sheet */
.hb-scrim { position: absolute; inset: 0; z-index: 100; display: flex; align-items: flex-end;
  justify-content: center; background: rgba(0,0,0,0.5); animation: hb-fadein .2s ease; }
@keyframes hb-fadein { from{opacity:0} to{opacity:1} }
.hb-sheet { width: 100%; max-width: 520px; max-height: 92%; overflow-y: auto; overflow-x: hidden; padding: 20px 18px max(24px, env(safe-area-inset-bottom));
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px 16px 0 0; display: flex; flex-direction: column; gap: 14px;
  animation: hb-sheetup .26s cubic-bezier(.2,.9,.3,1); }
@keyframes hb-sheetup { from{transform:translateY(100%)} to{transform:translateY(0)} }
.hb-sheet-grip { width: 38px; height: 4px; border-radius: 999px; background: var(--border); margin: -6px auto 2px; }
.hb-sheet-title { margin: 0; font-size: 19px; font-weight: 800; }
.hb-field { display: flex; flex-direction: column; gap: 7px; }
.hb-label { font-size: 13px; font-weight: 750; color: var(--muted); }
.hb-input { width: 100%; box-sizing: border-box; min-height: 46px; padding: 12px 13px; background: var(--bg);
  color: var(--text); border: 1px solid var(--border); border-radius: 8px; outline: none;
  font-family: var(--font); font-size: 16px; }
.hb-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.hb-row { display: flex; gap: 9px; }
.hb-row > * { flex: 1; }
.hb-hint { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--muted); }
.hb-input-static { display: flex; align-items: center; color: var(--muted); font-weight: 650; }

/* segmented control */
.hb-seg { display: flex; gap: 2px; height: 44px; background: var(--bg); border: 0; border-radius: 12px; box-shadow: inset 0 0 0 1px var(--border); }
.hb-seg button { flex: 1; box-sizing: border-box; min-height: 44px; border: none; background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 14px; font-weight: 700; border-radius: 9px; cursor: pointer; }
.hb-seg button.is-active { background: var(--accent-hover, var(--accent)); color: var(--accent-fg); }

/* emoji + palette pickers — auto-fill/minmax grid, NOT a fixed column count
   or a fixed cell size: repeat(10, 1fr) let each cell's own min-height:44px +
   aspect-ratio:1 push the computed track width above the container's actual
   1/10 share (a grid track's default min sizing is content-based, so it
   grows past its 1fr allotment to fit a 44px item), bleeding cells off the
   sheet's right edge on any phone narrower than ~520px — most phones. A
   fixed-size cell in a wrapping flex row stops the overflow but leaves a dead
   gap at the end of every full row, since fixed-size cells don't grow to use
   the row's remaining width. auto-fill + minmax fits as many >=40px cells as
   the row allows, THEN stretches all of them to share the row's full width
   evenly — so a row is always either full-width or the genuinely-last,
   partial row (never a lopsided gap), and it still can't overflow on any
   screen. */
.hb-emoji-grid, .hb-pal-grid { display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 6px; }
.hb-emoji-cell { position: relative; aspect-ratio: 1; border: none; background: var(--bg);
  border-radius: 8px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.hb-emoji-cell.is-active { background: color-mix(in srgb, var(--accent) 20%, transparent); box-shadow: 0 0 0 2px var(--accent); }
.hb-pal-cell { position: relative; aspect-ratio: 1; border-radius: 999px; border: 2px solid transparent; cursor: pointer; }
.hb-pal-cell.is-active { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text); }
/* Belt-and-suspenders: cells land well above 44px on most screens once
   stretched, but this keeps the tap target floor even on the rare knife-edge
   width where a cell computes right at the 40px minimum. */
.hb-emoji-cell::before, .hb-pal-cell::before { content: ''; position: absolute; inset: -3px; }

/* weekday picker */
.hb-week { display: flex; gap: 6px; }
.hb-week button { flex: 1; min-height: 44px; aspect-ratio: 1; border-radius: 999px; border: 1px solid var(--border);
  background: var(--bg); color: var(--muted); font-family: var(--font); font-size: 13px; font-weight: 800; cursor: pointer; }
.hb-week button.is-on { background: var(--accent-hover, var(--accent)); border-color: var(--accent-hover, var(--accent)); color: var(--accent-fg); }

/* buttons */
.hb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 48px;
  padding: 12px 18px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-family: var(--font); font-size: 15px; font-weight: 750; cursor: pointer;
  transition: transform .1s ease, filter .12s ease; }
.hb-btn:active { transform: scale(0.97); }
.hb-btn-primary { background: var(--accent-hover, var(--accent)); border-color: var(--accent-hover, var(--accent)); color: var(--accent-fg); }
.hb-btn-danger { background: var(--danger); border-color: var(--danger); color: var(--accent-fg); }
.hb-btn:disabled { opacity: 0.5; }
.hb-sheet-actions { display: flex; gap: 9px; margin-top: 4px; }
.hb-sheet-actions .hb-btn { flex: 1; }

/* all-habits grid */
.hb-grid { width: 100%; border-collapse: collapse; font-size: 13px; }
.hb-grid th { position: sticky; top: 0; background: var(--bg); z-index: 1; padding: 6px 2px 10px;
  font-size: 11px; font-weight: 750; color: var(--muted); text-align: center; }
.hb-grid th.hb-grid-name { text-align: left; padding-left: 4px; }
.hb-grid td { padding: 7px 2px; text-align: center; vertical-align: middle; }
.hb-grid-row td:first-child { text-align: left; }
.hb-grid-habit { display: flex; align-items: center; gap: 8px; min-width: 0; }
.hb-grid-habit .hb-grid-em { font-size: 17px; }
.hb-grid-habit .hb-grid-nm { font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 116px; }
.hb-cell { position: relative; width: 36px; height: 36px; margin: 0 auto; border-radius: 8px; display: flex; align-items: center;
  justify-content: center; font-size: 15px; font-weight: 800; cursor: pointer; border: 1.5px solid var(--border);
  color: var(--muted); }
.hb-cell::before { content: ""; position: absolute; inset: -4px; }
.hb-cell.is-yes { background: var(--hb-accent); border-color: var(--hb-accent); color: var(--accent-fg); }
.hb-cell.is-no { color: color-mix(in srgb, var(--danger) 60%, var(--muted)); }
.hb-cell.is-skip { border-style: dashed; }
.hb-cell.is-val { font-size: 12px; background: color-mix(in srgb, var(--hb-accent) 16%, transparent);
  border-color: transparent; color: color-mix(in srgb, var(--hb-accent) 80%, var(--text)); }

/* detail */
.hb-detail-head { flex: 0 0 auto; display: flex; align-items: center; gap: 11px; padding: calc(12px + env(safe-area-inset-top)) 12px 8px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--hb-accent) 16%, var(--bg)), var(--bg)); }
.hb-back { width: 44px; height: 44px; border-radius: 12px; border: none; background: var(--surface);
  color: var(--text); font-size: 20px; cursor: pointer; flex: 0 0 auto; }
.hb-detail-title { display: flex; align-items: center; gap: 9px; min-width: 0; }
.hb-detail-title .hb-dt-em { font-size: 24px; }
.hb-detail-title h2 { margin: 0; font-size: 20px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hb-kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 9px; }
.hb-kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 13px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 3px; }
.hb-kpi-big { font-size: 24px; font-weight: 850; color: var(--hb-accent); line-height: 1; }
.hb-kpi-lab { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.hb-section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 14px 10px; }
.hb-section h3 { margin: 0 0 10px; font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
.hb-section-sub { font-size: 12px; color: var(--muted); font-weight: 600; }

/* heatmap */
.hb-heat { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
.hb-heat-col { display: flex; flex-direction: column; gap: 3px; }
.hb-heat-cell { position: relative; width: 14px; height: 14px; border-radius: 4px; background: var(--surface2, var(--border));
  cursor: pointer; }
.hb-heat-cell::before { content: ""; position: absolute; inset: -15px; }
.hb-heat-cell.is-future { visibility: hidden; pointer-events: none; }

/* best streaks */
.hb-streaks { display: flex; flex-direction: column; gap: 8px; }
.hb-streak-row { display: flex; align-items: center; gap: 9px; font-size: 12.5px; }
.hb-streak-bar { height: 22px; border-radius: 7px; background: color-mix(in srgb, var(--hb-accent) 70%, transparent);
  display: flex; align-items: center; justify-content: flex-end; padding: 0 8px; color: var(--accent-fg); font-weight: 800;
  min-width: 30px; }
.hb-streak-dates { color: var(--muted); font-weight: 600; white-space: nowrap; }

/* frequency dot matrix */
.hb-freq { display: grid; grid-template-columns: 18px 1fr; gap: 6px 8px; align-items: center; }
.hb-freq-lab { font-size: 11px; font-weight: 750; color: var(--muted); }
.hb-freq-dots { display: flex; gap: 5px; }
.hb-freq-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--hb-accent); }

/* offline pill */
.hb-offline { align-self: center; display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  font-weight: 700; color: var(--muted); background: var(--surface); border: 1px solid var(--border);
  padding: 5px 12px; border-radius: 999px; }

/* failed-write banner — persistent, sits ABOVE the sheet (z 120 > scrim 100) so a
   save that fails inside a sheet is still visible; carries a Retry. */
.hb-errbar { position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom));
  transform: translateX(-50%); z-index: 120; display: flex; align-items: center; gap: 8px;
  max-width: calc(100% - 24px); background: var(--danger); color: var(--accent-fg);
  padding: 8px 8px 8px 15px; border-radius: 12px; box-shadow: 0 10px 28px rgba(0,0,0,0.35);
  animation: hb-toastin .24s ease; }
.hb-errbar-msg { font-size: 13.5px; font-weight: 750; }
.hb-errbar-retry { flex: 0 0 auto; min-height: 44px; padding: 0 15px; border: none; border-radius: 9px;
  background: rgba(255,255,255,0.24); color: var(--accent-fg); font-family: var(--font);
  font-size: 14px; font-weight: 800; cursor: pointer; transition: transform .1s ease, filter .12s ease; }
.hb-errbar-retry:active { transform: scale(0.95); filter: brightness(1.08); }
.hb-errbar-x { flex: 0 0 auto; min-width: 44px; height: 44px; border: none; border-radius: 9px;
  background: transparent; color: var(--accent-fg); font-size: 15px; cursor: pointer; opacity: 0.9; }

@media (prefers-reduced-motion: reduce) {
  .hb-check, .hb-add, .hb-btn, .hb-hero-fill, .hb-ring-fill { transition: none; }
  .hb-check.pop, .hb-confetti, .hb-sheet, .hb-scrim, .hb-toast, .hb-errbar { animation: none; }
}
`;

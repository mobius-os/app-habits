// The Habits app stylesheet — one scoped CSS string rendered once at the root as
// <style>{CSS}</style>. Class prefix `hb-`. Color comes from theme tokens for
// chrome (var(--bg) etc.); per-habit accent is passed via inline style as
// `--hb-accent` so the same classes tint per card. Playful: soft cards, springy
// taps, a celebratory check pop, a gradient hero. Honors prefers-reduced-motion.

export const CSS = `
.hb-root { position: relative; display: flex; flex-direction: column; height: 100%;
  overflow: hidden; background: var(--bg); color: var(--text); font-family: var(--font);
  -webkit-tap-highlight-color: transparent; }

/* header */
.hb-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 14px 16px 10px; }
.hb-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.hb-mark { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 11px; display: flex;
  align-items: center; justify-content: center; font-size: 19px;
  background: linear-gradient(150deg, #10b981, #f59e0b); box-shadow: 0 4px 14px rgba(16,185,129,0.35); }
/* the real installed icon variant — show the logo itself, no gradient tile */
.hb-mark-img { object-fit: contain; background: none; box-shadow: none; }
.hb-title { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.hb-add { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px;
  border: none; border-radius: 12px; background: var(--accent); color: var(--accent-fg);
  font-family: var(--font); font-size: 15px; font-weight: 700; cursor: pointer;
  transition: transform .12s ease, filter .12s ease; }
.hb-add:active { transform: scale(0.95); filter: brightness(1.05); }

/* tabs */
.hb-tabs { flex: 0 0 auto; display: flex; gap: 4px; margin: 2px 16px 8px; padding: 4px;
  background: var(--surface2, var(--surface)); border-radius: 12px; }
.hb-tab { flex: 1; min-height: 44px; border: none; background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 14px; font-weight: 700; border-radius: 9px; cursor: pointer;
  transition: background .15s ease, color .15s ease; }
.hb-tab.is-active { background: var(--surface); color: var(--text); box-shadow: 0 1px 4px rgba(0,0,0,0.12); }

/* scroll body */
.hb-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 4px 16px 40px; display: flex; flex-direction: column; gap: 12px;
  overscroll-behavior-y: contain; }

/* hero strip */
.hb-hero { position: relative; overflow: hidden; border-radius: 18px; padding: 18px 18px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, #000 0%),
    color-mix(in srgb, var(--accent) 55%, #7c3aed 45%)); color: #fff;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--accent) 28%, transparent); }
.hb-hero-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.hb-hero-count { font-size: 30px; font-weight: 850; letter-spacing: -0.02em; line-height: 1; }
.hb-hero-count small { font-size: 16px; font-weight: 700; opacity: 0.85; }
.hb-hero-streak { display: inline-flex; align-items: center; gap: 5px; font-size: 15px; font-weight: 800;
  background: rgba(255,255,255,0.22); padding: 6px 11px; border-radius: 999px; backdrop-filter: blur(4px); }
.hb-hero-sub { margin-top: 4px; font-size: 13px; font-weight: 600; opacity: 0.92; }
.hb-hero-bar { margin-top: 13px; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.25); overflow: hidden; }
.hb-hero-fill { height: 100%; border-radius: 999px; background: #fff; transition: width .5s cubic-bezier(.2,.8,.2,1); }

/* habit card (Today) */
.hb-card { display: flex; align-items: center; gap: 13px; padding: 13px 14px; border-radius: 16px;
  background: var(--surface); border: 1px solid var(--border);
  transition: transform .12s ease, box-shadow .2s ease; }
.hb-card.is-done { box-shadow: 0 4px 18px color-mix(in srgb, var(--hb-accent) 22%, transparent);
  border-color: color-mix(in srgb, var(--hb-accent) 45%, var(--border)); }
.hb-emoji { flex: 0 0 auto; width: 46px; height: 46px; border-radius: 14px; display: flex;
  align-items: center; justify-content: center; font-size: 24px;
  background: color-mix(in srgb, var(--hb-accent) 16%, transparent); }
.hb-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.hb-card-name { font-size: 16px; font-weight: 750; letter-spacing: -0.01em; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hb-card-sub { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 650; color: var(--muted); }
.hb-streakchip { display: inline-flex; align-items: center; gap: 3px;
  color: color-mix(in srgb, var(--hb-accent) 78%, var(--text)); font-weight: 800; }

/* strength ring */
.hb-ring { flex: 0 0 auto; }
.hb-ring-track { stroke: color-mix(in srgb, var(--hb-accent) 18%, transparent); }
.hb-ring-fill { stroke: var(--hb-accent); stroke-linecap: round;
  transition: stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1); }
.hb-ring-label { font-size: 11px; font-weight: 800; fill: var(--text); }

/* check tile */
.hb-check { flex: 0 0 auto; width: 52px; height: 52px; border-radius: 15px; border: 2px solid
  color-mix(in srgb, var(--hb-accent) 40%, var(--border)); background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: var(--hb-accent);
  font-size: 23px; font-weight: 800; transition: transform .14s cubic-bezier(.2,1.5,.4,1), background .14s ease; }
.hb-check:active { transform: scale(0.88); }
.hb-check.is-done { background: var(--hb-accent); border-color: var(--hb-accent); color: #fff; }
.hb-check.is-skip { border-style: dashed; color: var(--muted); border-color: var(--border); }
.hb-check.pop { animation: hb-pop .42s cubic-bezier(.2,1.4,.4,1); }
@keyframes hb-pop { 0%{transform:scale(.85)} 40%{transform:scale(1.18)} 100%{transform:scale(1)} }

/* measurable quick-entry */
.hb-meas { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 70px; }
.hb-meas-val { font-size: 19px; font-weight: 850; color: var(--hb-accent); line-height: 1; }
.hb-meas-val.is-zero { color: var(--muted); }
.hb-meas-unit { font-size: 11px; font-weight: 650; color: var(--muted); }
.hb-meas-btns { display: flex; gap: 4px; margin-top: 4px; }
.hb-step { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface2, var(--surface)); color: var(--text); font-size: 17px; font-weight: 800;
  cursor: pointer; display: flex; align-items: center; justify-content: center; }
.hb-step:active { transform: scale(0.9); }

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
.hb-empty-mark { width: 76px; height: 76px; margin-bottom: 8px; border-radius: 22px; display: flex;
  align-items: center; justify-content: center; font-size: 38px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 22%, transparent),
    color-mix(in srgb, #f59e0b 18%, transparent)); }
.hb-empty-title { font-size: 18px; font-weight: 800; color: var(--text); }
.hb-empty-text { margin: 0; font-size: 14px; line-height: 1.55; max-width: 280px; }

/* bottom sheet */
.hb-scrim { position: absolute; inset: 0; z-index: 100; display: flex; align-items: flex-end;
  justify-content: center; background: rgba(0,0,0,0.5); animation: hb-fadein .2s ease; }
@keyframes hb-fadein { from{opacity:0} to{opacity:1} }
.hb-sheet { width: 100%; max-width: 520px; max-height: 92%; overflow-y: auto; overflow-x: hidden; padding: 20px 18px 24px;
  background: var(--surface); border-radius: 22px 22px 0 0; display: flex; flex-direction: column; gap: 14px;
  animation: hb-sheetup .26s cubic-bezier(.2,.9,.3,1); }
@keyframes hb-sheetup { from{transform:translateY(100%)} to{transform:translateY(0)} }
.hb-sheet-grip { width: 38px; height: 4px; border-radius: 999px; background: var(--border); margin: -6px auto 2px; }
.hb-sheet-title { margin: 0; font-size: 19px; font-weight: 800; }
.hb-field { display: flex; flex-direction: column; gap: 7px; }
.hb-label { font-size: 13px; font-weight: 750; color: var(--muted); }
.hb-input { width: 100%; box-sizing: border-box; min-height: 46px; padding: 12px 13px; background: var(--bg);
  color: var(--text); border: 1px solid var(--border); border-radius: 11px; outline: none;
  font-family: var(--font); font-size: 16px; }
.hb-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.hb-row { display: flex; gap: 9px; }
.hb-row > * { flex: 1; }

/* segmented control */
.hb-seg { display: flex; gap: 4px; padding: 4px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; }
.hb-seg button { flex: 1; min-height: 40px; border: none; background: transparent; color: var(--muted);
  font-family: var(--font); font-size: 14px; font-weight: 700; border-radius: 9px; cursor: pointer; }
.hb-seg button.is-active { background: var(--accent); color: var(--accent-fg); }

/* emoji + palette pickers */
.hb-emoji-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; }
.hb-emoji-cell { aspect-ratio: 1; border: none; background: var(--bg); border-radius: 10px; font-size: 20px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; }
.hb-emoji-cell.is-active { background: color-mix(in srgb, var(--accent) 20%, transparent); box-shadow: 0 0 0 2px var(--accent); }
.hb-pal-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 7px; }
.hb-pal-cell { aspect-ratio: 1; border-radius: 999px; border: 2px solid transparent; cursor: pointer; }
.hb-pal-cell.is-active { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text); }

/* weekday picker */
.hb-week { display: flex; gap: 6px; }
.hb-week button { flex: 1; aspect-ratio: 1; border-radius: 999px; border: 1px solid var(--border);
  background: var(--bg); color: var(--muted); font-family: var(--font); font-size: 13px; font-weight: 800; cursor: pointer; }
.hb-week button.is-on { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }

/* buttons */
.hb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 48px;
  padding: 12px 18px; border-radius: 13px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-family: var(--font); font-size: 15px; font-weight: 750; cursor: pointer;
  transition: transform .1s ease, filter .12s ease; }
.hb-btn:active { transform: scale(0.97); }
.hb-btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.hb-btn-danger { background: transparent; border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); color: var(--danger); }
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
.hb-cell { width: 36px; height: 36px; margin: 0 auto; border-radius: 10px; display: flex; align-items: center;
  justify-content: center; font-size: 15px; font-weight: 800; cursor: pointer; border: 1.5px solid var(--border);
  color: var(--muted); }
.hb-cell.is-yes { background: var(--hb-accent); border-color: var(--hb-accent); color: #fff; }
.hb-cell.is-no { color: color-mix(in srgb, var(--danger) 60%, var(--muted)); }
.hb-cell.is-skip { border-style: dashed; }
.hb-cell.is-val { font-size: 12px; background: color-mix(in srgb, var(--hb-accent) 16%, transparent);
  border-color: transparent; color: color-mix(in srgb, var(--hb-accent) 80%, var(--text)); }

/* detail */
.hb-detail-head { flex: 0 0 auto; display: flex; align-items: center; gap: 11px; padding: 12px 12px 8px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--hb-accent) 16%, var(--bg)), var(--bg)); }
.hb-back { width: 44px; height: 44px; border-radius: 12px; border: none; background: var(--surface);
  color: var(--text); font-size: 20px; cursor: pointer; flex: 0 0 auto; }
.hb-detail-title { display: flex; align-items: center; gap: 9px; min-width: 0; }
.hb-detail-title .hb-dt-em { font-size: 24px; }
.hb-detail-title h2 { margin: 0; font-size: 20px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hb-kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 9px; }
.hb-kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 13px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 3px; }
.hb-kpi-big { font-size: 24px; font-weight: 850; color: var(--hb-accent); line-height: 1; }
.hb-kpi-lab { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.hb-section { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px 14px 10px; }
.hb-section h3 { margin: 0 0 10px; font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
.hb-section-sub { font-size: 12px; color: var(--muted); font-weight: 600; }

/* heatmap */
.hb-heat { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
.hb-heat-col { display: flex; flex-direction: column; gap: 3px; }
.hb-heat-cell { width: 14px; height: 14px; border-radius: 4px; background: var(--surface2, var(--border));
  cursor: pointer; }
.hb-heat-cell.is-future { visibility: hidden; pointer-events: none; }

/* best streaks */
.hb-streaks { display: flex; flex-direction: column; gap: 8px; }
.hb-streak-row { display: flex; align-items: center; gap: 9px; font-size: 12.5px; }
.hb-streak-bar { height: 22px; border-radius: 7px; background: color-mix(in srgb, var(--hb-accent) 70%, transparent);
  display: flex; align-items: center; justify-content: flex-end; padding: 0 8px; color: #fff; font-weight: 800;
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

@media (prefers-reduced-motion: reduce) {
  .hb-check, .hb-add, .hb-btn, .hb-hero-fill, .hb-ring-fill { transition: none; }
  .hb-check.pop, .hb-confetti, .hb-sheet, .hb-scrim, .hb-toast { animation: none; }
}
`;

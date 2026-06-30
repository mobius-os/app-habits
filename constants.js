// Shared UI constants for the Habits app: the accent palette, default emoji set,
// frequency presets, and weekday helpers. Kept out of domain.js (which stays a
// pure scoring module) and out of theme.js (which is only the stylesheet).

// 20-color accent palette (index 0–19 stored on each habit). Hand-picked to read
// well on both light and dark surfaces; these are app identity colors, so literal
// hex is correct here (theme tokens are for chrome, not per-habit identity).
export const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#78716c', '#64748b', '#0f766e',
];

export function accent(colorIndex) {
  return PALETTE[((colorIndex % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

// A small, friendly default emoji set offered in the picker.
export const EMOJIS = [
  '🔥', '💪', '🏃', '🧘', '📚', '✍️', '💧', '🥗', '😴', '🧹',
  '🎸', '🎨', '🧠', '💰', '🌱', '☀️', '🦷', '📵', '🚭', '❤️',
  '🏋️', '🚶', '🍎', '☕', '🎯', '🛏️', '📝', '🙏', '🌊', '⏰',
];

// Frequency presets shown in the add/edit sheet. days = freqNum/freqDen.
export const FREQ_PRESETS = [
  { label: 'Every day', freqNum: 1, freqDen: 1 },
  { label: '3× per week', freqNum: 3, freqDen: 7 },
  { label: '2× per week', freqNum: 2, freqDen: 7 },
  { label: 'Once a week', freqNum: 1, freqDen: 7 },
  { label: 'Every other day', freqNum: 1, freqDen: 2 },
  { label: 'Once a month', freqNum: 1, freqDen: 30 },
];

export function freqLabel(habit) {
  const match = FREQ_PRESETS.find(
    (p) => p.freqNum === habit.freqNum && p.freqDen === habit.freqDen,
  );
  if (match) return match.label;
  return `${habit.freqNum}× per ${habit.freqDen} days`;
}

// Weekday mask helpers. Bit 0 = Sunday … bit 6 = Saturday. 127 = every day.
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const EVERY_DAY_MASK = 127;

export function maskHasDay(mask, weekday) {
  return (mask & (1 << weekday)) !== 0;
}

export function toggleMaskDay(mask, weekday) {
  return mask ^ (1 << weekday);
}

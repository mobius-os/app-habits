# Habits

A modern, playful habit tracker for [Möbius](https://github.com/mobius-os) —
inspired by Loop Habit Tracker, rebuilt as a spacious, celebratory experience.

- **Today** — a card per habit with its streak, a strength ring, and a one-tap
  check (or a +/- stepper for measurable habits). Checking off fires a confetti
  burst and a streak toast.
- **All Habits** — a dense multi-day grid for the power-user view.
- **Habit detail** — a streak-led hero, the **strength score** (an exponential
  moving average, faithful to Loop), monthly history bars, a GitHub-style
  **calendar heatmap** (tap a past day to backfill), best streaks, and weekday
  frequency.
- **Yes/No and measurable habits** (target value + unit, at-least / at-most),
  per-habit color + emoji, flexible frequency, and **per-habit reminders**.
- Offline-first, with a real designed dark mode.

## This app is multi-file on purpose

Möbius catalog apps historically shipped as one giant `index.jsx`. This one is a
clean module tree so the agent (and you) read *structure*, not thousands of lines:

```
index.jsx        # thin shell: storage wiring, tab/detail nav, add/edit/delete
domain.js        # pure scoring / streak / frequency logic — no React, no I/O (unit-tested)
storage.js       # the window.mobius.storage data layer (habits + per-day logs)
theme.js         # the scoped stylesheet (one CSS string)
constants.js     # palette, emoji set, frequency presets, weekday helpers
ui/
  Chrome.jsx     # shared blocks: Ring, Sheet, EmptyState, Confetti, Toast, …
  Today.jsx      # the Today card list + celebration
  AllHabits.jsx  # the dense multi-day grid
  Detail.jsx     # KPIs + charts + heatmap + best streaks + frequency
  HabitForm.jsx  # add / edit bottom sheet
  Charts.jsx     # recharts wrappers (score curve + history bars)
  Heatmap.jsx    # the contribution calendar
remind.sh        # per-habit reminder cron job
```

The manifest declares every module in `source_files`, so the installer fetches the
whole tree and Möbius compiles `index.jsx` with its imports. Edit any module
locally and your edits survive store updates.

## Data model

- `habits.json` — the array of habits.
- `logs/<YYYY-MM-DD>.json` — one file per day, `{ habitId: value }` (last-write-wins
  per path, so concurrent edits to different days never clobber).

Value encoding and the strength/streak math live in `domain.js` and match Loop
Habit Tracker (verified against its `ScoreTest.kt`).

## Reminders

`remind.sh` is scheduled every minute and exits immediately unless a habit's
reminder time, weekday, and not-yet-done status all match — then it sends a Web
Push that deep-links into the app. To test it safely, run it with `DRY_RUN=1` (it
prints the payload instead of sending a real notification).

## Development

```bash
node --test            # run the domain unit tests (10 tests)
```

The app is pure JSX + the `react` and `recharts` import-map libraries; there is no
build step — Möbius compiles it on install.

## License

MIT — see [LICENSE](LICENSE).

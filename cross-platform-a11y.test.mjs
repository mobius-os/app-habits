import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./theme.js', import.meta.url), 'utf8');

test('nested views use the shell back sentinel and await readiness', () => {
  assert.match(index, /window\.mobius\.nav\.open/, 'nested views must register with the shell back protocol');
  assert.match(index, /await handle\.ready/, 'nav.open handles must await handle.ready before rendering nested state');
  for (const label of ['habits-detail', 'habits-form', 'habits-confirm-delete', 'habits-number-entry']) {
    assert.match(index, new RegExp(label), `${label} should have its own shell nav label`);
  }
});

test('top-pinned headers and scroll bottom include safe-area insets', () => {
  assert.match(css, /\.hb-header[^}]*env\(safe-area-inset-top\)/, 'main header needs top safe-area padding');
  assert.match(css, /\.hb-detail-head[^}]*env\(safe-area-inset-top\)/, 'detail header needs top safe-area padding');
  assert.match(css, /\.hb-scroll[^}]*env\(safe-area-inset-bottom\)/, 'scroll content needs bottom safe-area padding');
});

test('view tabs use roving focus, arrow keys, and labelled tab panels', () => {
  assert.match(index, /tabIndex=\{tab === 'today' \? 0 : -1\}/);
  assert.match(index, /event\.key === 'ArrowRight'/);
  assert.match(index, /event\.key === 'Home'/);
  assert.match(index, /role="tabpanel" aria-labelledby="hb-tab-today"/);
  assert.match(index, /role="tabpanel" aria-labelledby="hb-tab-all"/);
});

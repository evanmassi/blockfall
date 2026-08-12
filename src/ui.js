// Overlay screens, HUD text and the markup helpers. Owns no game rules; game.js
// composes these into the menu, pause and game-over screens.

import { G } from './state.js';
import { THEMES, theme } from './themes.js';
import { TYPES } from './pieces.js';
import { applyTheme, drawThemePreview, drawWordmarkL, drawDebris } from './render.js';
import { READY_MS, READY_BEATS } from './config.js';
import { overlay, toastEl, countdownEl, scoreEl, levelEl, linesEl, comboStat, comboEl } from './dom.js';

// Forced, so the hardware recreations get their own row regardless of viewport.
const PICKER_ROW_BREAK = 3;

export function themeBar() {
  const swatches = Object.entries(THEMES).map(([key, t], i) => `
    ${i === PICKER_ROW_BREAK ? '<span class="themeBreak"></span>' : ''}
    <button class="swatch${key === theme.key ? ' on' : ''}" data-theme="${key}" aria-label="${t.name}">
      <canvas class="swatchCv"></canvas>
      <em>${t.name}</em>
    </button>`).join('');
  return `<div class="themes">${swatches}</div>`;
}

export function wordmark() {
  return `
    <div class="markWrap">
      <h1 class="mark"><span>B</span><canvas class="markL"></canvas><span>OCKFALL</span></h1>
      <div class="markFloor"></div>
    </div>`;
}

// Debris drifting behind the menu, as a depth field: [count, near, far] per
// band. Weighted to the back, because a thin distance is what stops reading as
// distance.
const DEBRIS_BANDS = [[7, 0, 0.33], [4, 0.34, 0.66], [3, 0.67, 1]];

const lerp = (a, b, t) => a + (b - a) * t;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Depth 0 is furthest, 1 is closest. Every property is derived from it so the
// layers stay consistent with each other; tune the endpoints, not each piece.
function debrisField() {
  const depths = DEBRIS_BANDS.flatMap(([count, lo, hi]) =>
    Array.from({ length: count }, () => lerp(lo, hi, Math.random())));

  // Shuffled so depth doesn't correlate with the lane a piece falls in.
  for (let i = depths.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [depths[i], depths[j]] = [depths[j], depths[i]];
  }

  const lane = 100 / depths.length;
  return depths.map((d, i) => ({
    d,
    type: pick(TYPES),
    left: i * lane + Math.random() * lane,
    sign: Math.random() < 0.5 ? -1 : 1,
  }));
}

export function menuBackdrop() {
  const bits = debrisField().map(({ d, type, left, sign }) => {
    // Snapped to even pixels: the sprite cache keys on size and is only dropped
    // on resize or theme change, so free-floating sizes would grow it forever.
    const unit = Math.max(4, Math.round(lerp(4, 20, d) / 2) * 2);
    const dur = lerp(34, 8, d);
    // Reaches zero before the near band, so nothing close is ever soft.
    const blur = Math.max(0, 1 - d / 0.7) ** 1.2 * 2.6;
    return `<canvas class="debrisCv" data-type="${type}" data-cell="${unit}"
      style="left:${left.toFixed(2)}%; z-index:${Math.round(d * 100)};
      --spin:${Math.round(lerp(60, 400, d)) * sign}deg;
      --sway:${(lerp(6, 26, d) * -sign).toFixed(1)}px;
      opacity:${lerp(0.05, 0.22, d).toFixed(3)};
      ${blur > 0.15 ? `filter:blur(${blur.toFixed(2)}px);` : ''}
      animation-duration:${dur.toFixed(1)}s;
      animation-delay:-${(Math.random() * dur).toFixed(1)}s;"></canvas>`;
  }).join('');
  return `<div class="bgfall" aria-hidden="true">${bits}</div>`;
}

// Canvases in overlay markup can only be drawn once they are in the document,
// so every showOverlay() sweeps for them.
function paintOverlayCanvases() {
  for (const btn of overlay.querySelectorAll?.('[data-theme]') || []) {
    const cv = btn.querySelector?.('canvas');
    if (cv) drawThemePreview(cv, THEMES[btn.dataset.theme]);
  }
  const mark = overlay.querySelector?.('.markL');
  if (mark) drawWordmarkL(mark);
  for (const cv of overlay.querySelectorAll?.('.debrisCv') || []) {
    drawDebris(cv, cv.dataset.type, +cv.dataset.cell);
  }
}

// pointerdown, not click: `touch-action: none` on the board suppresses
// synthesized clicks on WebKit, and this listener runs before the one in
// input.js that would otherwise treat the tap as "start/resume".
overlay.addEventListener('pointerdown', e => {
  const btn = e.target.closest?.('[data-theme]');
  if (!btn) return;
  applyTheme(btn.dataset.theme);
  for (const el of overlay.querySelectorAll('[data-theme]')) {
    el.classList.toggle('on', el.dataset.theme === theme.key);
  }
  paintOverlayCanvases(); // the wordmark follows the new palette
});

let actionHandler = null;

// Inverted so the buttons can be bound directly rather than delegated.
export function onOverlayAction(fn) { actionHandler = fn; }

/**
 * @param {{soft?: boolean, intro?: boolean}} [opts]
 *   soft  — lighter backdrop, board readable behind it (pause).
 *   intro — stage contents in after the title drop. Off anywhere that must
 *           appear instantly.
 */
export function showOverlay(html, opts = {}) {
  overlay.innerHTML = html;
  overlay.classList.toggle('soft', !!opts.soft);
  overlay.classList.toggle('intro', !!opts.intro);
  overlay.classList.remove('hidden');
  paintOverlayCanvases();

  // Bound on the button itself; stopPropagation keeps the tap from also
  // reaching the overlay's tap-anywhere handler, which the two used to race.
  for (const btn of overlay.querySelectorAll?.('[data-act]') || []) {
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      e.preventDefault();
      actionHandler?.(btn.dataset.act);
    });
  }
}

/**
 * @param {Array<[string, string]>} actions  [action, label] pairs, or null for
 *   a row break. An action with no branch in input.js's handler produces a
 *   button that silently does nothing, so the two must be kept in step.
 */
export function actionBar(actions) {
  const buttons = actions
    .map(entry => (entry === null
      ? '<span class="btnBreak"></span>'
      : `<button class="menuBtn" data-act="${entry[0]}">${entry[1]}</button>`))
    .join('');
  return `<div class="menuBtns">${buttons}</div>`;
}

export function hideOverlay() {
  overlay.classList.add('hidden');
}

export function showToast(text, color) {
  toastEl.textContent = text;
  toastEl.style.color = color;
  toastEl.animate(
    [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.75)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.22 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.65 },
      { opacity: 0, transform: 'translate(-50%,-90%) scale(.95)' },
    ],
    { duration: 1100, easing: 'ease-out' }
  );
}

export function setRecordStyle(on) {
  scoreEl.classList.toggle('record', on);
}

let shownCount = 0;

/** @param {number} n  beats remaining, 0 to clear. */
export function setCountdown(n) {
  if (n === shownCount) return;
  shownCount = n;
  countdownEl.textContent = n > 0 ? n : '';
  if (n <= 0) return;
  countdownEl.animate(
    [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.7)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.28 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.8 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.92)' },
    ],
    { duration: READY_MS / READY_BEATS, easing: 'ease-out' }
  );
}

let shownScore = 0;

export function updateHud() {
  levelEl.textContent = G.level;
  linesEl.textContent = G.lines;

  // tickScore eases the score up, but a reset lands immediately — counting
  // *down* to zero on a new game would be absurd.
  if (G.score < shownScore) {
    shownScore = G.score;
    scoreEl.textContent = shownScore.toLocaleString();
  }

  // G.combo counts from 0, so a chain of two reads as 1.
  const chained = G.combo > 0;
  comboStat.hidden = !chained;
  if (chained) comboEl.textContent = (G.combo + 1) + '×';
}

// A fixed fraction of the gap per frame: soft-drop points land the same frame,
// a Tetris visibly counts up.
export function tickScore() {
  if (shownScore === G.score) return;
  const gap = G.score - shownScore;
  shownScore = gap > 0 ? Math.min(G.score, shownScore + Math.max(1, Math.ceil(gap * 0.2))) : G.score;
  scoreEl.textContent = shownScore.toLocaleString();
}

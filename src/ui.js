// Overlay screens, HUD text and the markup helpers. Owns no game rules; game.js
// composes these into the menu, pause and game-over screens.

import { G } from './state.js';
import { THEMES, theme } from './themes.js';
import { ROTATIONS, forEachCell } from './pieces.js';
import { applyTheme, drawThemePreview, drawWordmarkL } from './render.js';
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

// Debris drifting behind the menu: [left%, type, cell px, seconds, delay]
const DEBRIS = [
  [4, 'T', 11, 15, 0], [20, 'I', 9, 19, -7], [36, 'S', 12, 16, -12],
  [51, 'O', 10, 21, -3], [65, 'L', 11, 17, -10], [79, 'J', 9, 23, -16],
  [90, 'Z', 12, 14, -5], [28, 'I', 8, 25, -20],
];

// From the real rotation tables, so the shapes falling past are the actual
// seven tetrominoes rather than anonymous rectangles.
function debrisPiece(type) {
  const m = ROTATIONS[type][0];
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  forEachCell(m, (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const cells = [];
  forEachCell(m, (x, y) => cells.push(`<b style="grid-column:${x - minX + 1};grid-row:${y - minY + 1}"></b>`));
  return { w: maxX - minX + 1, h: maxY - minY + 1, cells: cells.join('') };
}

export function menuBackdrop() {
  const bits = DEBRIS.map(([left, type, unit, dur, delay]) => {
    const p = debrisPiece(type);
    return `<i style="left:${left}%; --c:var(--piece-${type.toLowerCase()});
      grid-template-columns:repeat(${p.w},${unit}px);
      grid-template-rows:repeat(${p.h},${unit}px);
      animation-duration:${dur}s; animation-delay:${delay}s;">${p.cells}</i>`;
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

// Overlay screens, HUD text and the markup helpers the game builds them from.
// Owns no game rules; game.js composes these into the menu, pause and game-over
// screens.

import { G } from './state.js';
import { THEMES, theme } from './themes.js';
import { ROTATIONS, forEachCell } from './pieces.js';
import { applyTheme, drawThemePreview, drawWordmarkL } from './render.js';
import { overlay, toastEl, scoreEl, levelEl, linesEl, comboStat, comboEl } from './dom.js';

// The hardware recreations sit on their own row, so the break is forced rather
// than left to whatever the viewport width happens to wrap at.
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

// Built from the real rotation tables, so the shapes falling past are the
// actual seven tetrominoes rather than anonymous rectangles.
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

// Canvases in overlay markup can only be drawn once they're actually in the
// document, so every showOverlay() sweeps for them.
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

// input.js registers what the overlay's buttons do. Inverted this way so the
// buttons can be bound directly instead of delegated through the overlay.
export function onOverlayAction(fn) { actionHandler = fn; }

/**
 * Renders an overlay screen and wires up anything inside it.
 *
 * @param {string} html
 * @param {{soft?: boolean, intro?: boolean}} [opts]
 *   soft  — lighter backdrop, so the board stays readable behind it (pause).
 *   intro — stage the contents in after the title's drop animation (menu).
 *           Leave it off anywhere that must appear instantly.
 */
export function showOverlay(html, opts = {}) {
  overlay.innerHTML = html;
  overlay.classList.toggle('soft', !!opts.soft);   // board readable behind
  overlay.classList.toggle('intro', !!opts.intro); // staged reveal after the drop
  overlay.classList.remove('hidden');
  paintOverlayCanvases();

  // Bound on the button itself, and stopPropagation keeps the tap from also
  // reaching the overlay's tap-anywhere handler. Delegating this through the
  // overlay left the two competing for the same event.
  for (const btn of overlay.querySelectorAll?.('[data-act]') || []) {
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      e.preventDefault();
      actionHandler?.(btn.dataset.act);
    });
  }
}

/**
 * Buttons for an overlay screen.
 *
 * @param {Array<[string, string]>} actions  [action, label] pairs.
 *   The action string is dispatched to the onOverlayAction handler in
 *   input.js — a value with no branch there produces a button that silently
 *   does nothing, so the two must be kept in step.
 */
export function actionBar(actions) {
  const buttons = actions
    .map(([act, label]) => `<button class="menuBtn" data-act="${act}">${label}</button>`)
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

let shownScore = 0;

export function updateHud() {
  levelEl.textContent = G.level;
  linesEl.textContent = G.lines;

  // Score is eased by tickScore rather than written here, but a reset has to
  // land immediately — counting *down* to zero on a new game would be absurd.
  if (G.score < shownScore) {
    shownScore = G.score;
    scoreEl.textContent = shownScore.toLocaleString();
  }

  // G.combo counts chained clears from 0, so a chain of two reads as 1.
  const chained = G.combo > 0;
  comboStat.hidden = !chained;
  if (chained) comboEl.textContent = (G.combo + 1) + '×';
}

/**
 * Eases the displayed score toward the real one, a fixed fraction of the gap
 * per frame. Soft-drop points land the same frame; a Tetris visibly counts up.
 */
export function tickScore() {
  if (shownScore === G.score) return;
  const gap = G.score - shownScore;
  shownScore = gap > 0 ? Math.min(G.score, shownScore + Math.max(1, Math.ceil(gap * 0.2))) : G.score;
  scoreEl.textContent = shownScore.toLocaleString();
}

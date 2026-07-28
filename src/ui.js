import { G } from './state.js';
import { THEMES, theme } from './themes.js';
import { ROTATIONS, forEachCell } from './pieces.js';
import { applyTheme, drawThemePreview, drawWordmarkL } from './render.js';
import { overlay, toastEl, scoreEl, levelEl, linesEl } from './dom.js';

export function themeBar() {
  const swatches = Object.entries(THEMES).map(([key, t]) => `
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

export function updateHud() {
  scoreEl.textContent = G.score.toLocaleString();
  levelEl.textContent = G.level;
  linesEl.textContent = G.lines;
}

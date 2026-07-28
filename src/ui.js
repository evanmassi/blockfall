import { G } from './state.js';
import { THEMES, theme } from './themes.js';
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

// Debris drifting behind the menu: [left%, w, h, seconds, delay, piece]
const DEBRIS = [
  [6, 12, 24, 13, 0, 'i'], [22, 24, 12, 17, -6, 'l'], [38, 12, 36, 15, -11, 't'],
  [55, 24, 24, 19, -3, 's'], [70, 12, 24, 14, -9, 'i'], [86, 36, 12, 21, -15, 'l'],
  [15, 12, 12, 23, -18, 't'], [63, 12, 12, 16, -13, 's'],
];

export function menuBackdrop() {
  const bits = DEBRIS.map(([left, w, h, dur, delay, piece]) => `
    <i style="left:${left}%; width:${w}px; height:${h}px; background:var(--piece-${piece});
              animation-duration:${dur}s; animation-delay:${delay}s;"></i>`).join('');
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

overlay.addEventListener('click', e => {
  const btn = e.target.closest?.('[data-theme]');
  if (!btn) return;
  applyTheme(btn.dataset.theme);
  for (const el of overlay.querySelectorAll('[data-theme]')) {
    el.classList.toggle('on', el.dataset.theme === theme.key);
  }
  paintOverlayCanvases(); // the wordmark follows the new palette
});

export function showOverlay(html, soft = false) {
  overlay.innerHTML = html;
  overlay.classList.toggle('soft', soft);
  overlay.classList.remove('hidden');
  paintOverlayCanvases();
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

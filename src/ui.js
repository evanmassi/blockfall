import { G } from './state.js';
import { THEMES, theme } from './themes.js';
import { applyTheme } from './render.js';
import { overlay, toastEl, scoreEl, levelEl, linesEl } from './dom.js';

// Four piece colors are enough to tell the palettes apart at swatch size.
export function themeBar() {
  const swatches = Object.entries(THEMES).map(([key, t]) => `
    <button class="swatch${key === theme.key ? ' on' : ''}" data-theme="${key}" aria-label="${t.name}">
      <span class="chips" style="background:${t.well}">
        <i style="background:${t.pieces.I}"></i><i style="background:${t.pieces.L}"></i>
        <i style="background:${t.pieces.S}"></i><i style="background:${t.pieces.T}"></i>
      </span>
      <em>${t.name}</em>
    </button>`).join('');
  return `<div class="themes">${swatches}</div>`;
}

// Swatches repaint themselves in place rather than re-rendering the overlay,
// which would mean ui.js reaching back into game.js for the screen markup.
overlay.addEventListener('click', e => {
  const btn = e.target.closest?.('[data-theme]');
  if (!btn) return;
  applyTheme(btn.dataset.theme);
  for (const el of overlay.querySelectorAll('[data-theme]')) {
    el.classList.toggle('on', el.dataset.theme === theme.key);
  }
});

export function showOverlay(html) {
  overlay.innerHTML = html;
  overlay.classList.remove('hidden');
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

export function updateHud() {
  scoreEl.textContent = G.score.toLocaleString();
  levelEl.textContent = G.level;
  linesEl.textContent = G.lines;
}

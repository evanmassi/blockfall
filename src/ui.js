import { G } from './state.js';
import { overlay, toastEl, scoreEl, levelEl, linesEl } from './dom.js';

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

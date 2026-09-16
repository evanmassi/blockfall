import { G } from './state.js';
import { THEMES, theme, setChrome } from './themes.js';
import { TYPES } from './pieces.js';
import { applyTheme, drawThemePreview, drawWordmarkL, drawDebris } from './render.js';
import { READY_MS, READY_BEATS } from './config.js';
import {
  overlay, toastEl, countdownEl, scoreEl, levelEl, linesEl, comboStat, comboEl,
  undoBtn, undoLeftEl, app,
} from './dom.js';

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

const DEBRIS_BANDS = [[7, 0, 0.33], [4, 0.34, 0.66], [3, 0.67, 1]];

const lerp = (a, b, t) => a + (b - a) * t;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function debrisField() {
  const depths = DEBRIS_BANDS.flatMap(([count, lo, hi]) =>
    Array.from({ length: count }, () => lerp(lo, hi, Math.random())));

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
    phase: Math.random(),
  }));
}

let field = null;

export function menuBackdrop(drifted) {
  if (drifted === undefined) field = debrisField();
  const bits = field.map(({ d, type, left, sign, phase }) => {
    const unit = Math.max(4, Math.round(lerp(4, 20, d) / 2) * 2);
    const dur = lerp(34, 8, d);
    const blur = Math.max(0, 1 - d / 0.7) ** 1.2 * 2.6;
    return `<canvas class="debrisCv" data-type="${type}" data-cell="${unit}"
      style="left:${left.toFixed(2)}%; z-index:${Math.round(d * 100)};
      --spin:${Math.round(lerp(60, 400, d)) * sign}deg;
      --sway:${(lerp(6, 26, d) * -sign).toFixed(1)}px;
      opacity:${lerp(0.05, 0.22, d).toFixed(3)};
      ${blur > 0.15 ? `filter:blur(${blur.toFixed(2)}px);` : ''}
      animation-duration:${dur.toFixed(1)}s;
      animation-delay:-${(phase * dur + (drifted ?? 0)).toFixed(1)}s;"></canvas>`;
  }).join('');
  return `<div class="bgfall" aria-hidden="true">${bits}</div>`;
}

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

// PITFALL: pointerdown, not click; `touch-action: none` on the board suppresses synthesized clicks on WebKit, and this must run before input.js's tap-to-resume listener.
overlay.addEventListener('pointerdown', e => {
  const btn = e.target.closest?.('[data-theme]');
  if (!btn) return;
  applyTheme(btn.dataset.theme);
  for (const el of overlay.querySelectorAll('[data-theme]')) {
    el.classList.toggle('on', el.dataset.theme === theme.key);
  }
  paintOverlayCanvases();
});

let actionHandler = null;

export function onOverlayAction(fn) { actionHandler = fn; }

export function showOverlay(html, opts = {}) {
  stopWheels();
  overlay.innerHTML = html;
  overlay.classList.toggle('soft', !!opts.soft);
  overlay.classList.toggle('intro', !!opts.intro);
  overlay.classList.toggle('modal', !!opts.modal);
  overlay.classList.toggle('picking', !!opts.picking);
  overlay.classList.remove('hidden');
  setChrome(opts.soft ? 'soft' : 'overlay');
  paintOverlayCanvases();

  for (const btn of overlay.querySelectorAll?.('[data-act]') || []) {
    // PITFALL: a wheel item must use click; preventDefault on pointerdown cancels the scroll the moment a finger lands on it.
    const onWheel = btn.className?.includes?.('wheelItem');
    btn.addEventListener(onWheel ? 'click' : 'pointerdown', e => {
      e.stopPropagation();
      if (!onWheel) e.preventDefault();
      actionHandler?.(btn.dataset.act);
    });
  }

  syncWheels();
}

// PITFALL: must match --rowH in the stylesheet; a test holds the two together.
const WHEEL_ROW = 26;

// PITFALL: a settle timer outliving its rebuilt wheel reads scrollTop 0 from the detached node and silently commits the first option, so stopWheels() must precede every rebuild.
let pending = [];
function stopWheels() {
  for (const t of pending) clearTimeout(t);
  pending = [];
}

function syncWheels() {
  for (const el of overlay.querySelectorAll?.('.wheelScroll') || []) {
    const rows = [...(el.querySelectorAll?.('.wheelItem') || [])];
    const atNow = () => Number(el.dataset?.at) || 0;
    let settle = 0, frame = 0;

    const curve = () => {
      frame = 0;
      const middle = el.scrollTop / WHEEL_ROW;
      rows.forEach((row, i) => {
        const d = i - middle;
        const away = Math.min(Math.abs(d), 2.6);
        row.style.transform =
          `rotateX(${(-d * 26).toFixed(1)}deg) scale(${(1.42 - away * 0.24).toFixed(3)})`;
        row.style.opacity = Math.max(0, 1 - away * 0.36).toFixed(3);
      });
    };

    // PITFALL: iOS momentum pauses between frames and snaps to fractional pixels at dpr 3, so "settled" is two equal consecutive reads, never a test for an exact row multiple.
    let resting = NaN;
    const commit = () => {
      if (el.isConnected === false) return;
      const top = el.scrollTop;
      if (top !== resting) { resting = top; arm(70); return; }
      const landed = Math.round(top / WHEEL_ROW);
      if (landed === atNow()) return;
      const act = rows[landed]?.dataset?.act;
      if (act) actionHandler?.(act);
    };

    const arm = ms => {
      clearTimeout(settle);
      settle = setTimeout(commit, ms);
      pending.push(settle);
    };

    el.addEventListener?.('scroll', () => {
      if (!frame) frame = requestAnimationFrame(curve);
      resting = NaN;
      arm(90);
    });

    el.scrollTop = atNow() * WHEEL_ROW;
    curve();
  }
}

export function actionBar(actions, cls = '') {
  const buttons = actions
    .map(entry => {
      if (entry === null) return '<span class="btnBreak"></span>';
      const [act, label, sub, mods] = entry;
      return `<button class="menuBtn${mods ? ` ${mods}` : ''}" data-act="${act}">` +
             `${label}${sub ? `<em>${sub}</em>` : ''}</button>`;
    })
    .join('');
  return `<div class="menuBtns${cls ? ` ${cls}` : ''}">${buttons}</div>`;
}

export const rule = () => '<div class="menuRule"></div>';

export const textButton = (act, label) =>
  `<button class="textBtn" data-act="${act}">${label}</button>`;

export const textRow = (...buttons) => `<div class="textBtns">${buttons.join('')}</div>`;

export const toggle = (act, value, on) =>
  `<button class="setToggle${on ? ' on' : ''}" data-act="${act}">${value}</button>`;

export const wheel = (key, options, value) => `
  <div class="wheel" data-wheel="${key}">
    <div class="wheelBand" aria-hidden="true"></div>
    <div class="wheelScroll" data-at="${Math.max(0, options.findIndex(([v]) => v === value))}">
      ${options.map(([v, label]) => `
        <button class="wheelItem${v === value ? ' on' : ''}"
                data-act="set-${key}-${v}">${label}</button>`).join('')}
    </div>
  </div>`;

export const settingRow = (key, label, control, sub) => `
  <div class="setRow">
    <div class="setText">
      <span class="label">${label}</span>
      <em class="setSub" data-sub="${key}">${sub}</em>
    </div>
    <div class="setCtl">${control}</div>
  </div>`;

// PITFALL: scroll, never re-render; a rebuild resets scrollTop while iOS momentum is still running and lands the wheel a number off.
export function setWheel(key, index) {
  const el = overlay.querySelector?.(`[data-wheel="${key}"] .wheelScroll`);
  if (!el) return;
  el.dataset.at = String(index);
  if (el.scrollTo) el.scrollTo({ top: index * WHEEL_ROW, behavior: 'smooth' });
  else el.scrollTop = index * WHEEL_ROW;
}

export function setSettingText(subs) {
  for (const el of overlay.querySelectorAll?.('[data-sub]') || []) {
    const text = subs[el.dataset?.sub];
    if (text !== undefined) el.textContent = text;
  }
}

export function setBoardShowing(on) {
  app.classList.toggle('atMenu', !on);
}

// PITFALL: an installed iOS app (black-translucent) sizes the viewport screen-minus-status-bar; only under navigator.standalone is screen.height the right span; elsewhere it overshoots the window.
export function syncScreenHeight() {
  const vp = window.innerHeight || 0;
  const px = navigator.standalone ? Math.max(vp, window.screen?.height || 0) : vp;
  document.documentElement.style.setProperty('--screen-h', px ? `${px}px` : '100%');
}

export function hideOverlay() {
  overlay.classList.add('hidden');
  setBoardShowing(true);
  setChrome('base');
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

let undoShown = '';

export function setUndo(on, left, live) {
  const key = `${on}/${left}/${live}`;
  if (key === undoShown) return;
  undoShown = key;
  undoBtn.hidden = !on;
  undoBtn.disabled = !live;
  undoLeftEl.textContent = String(left);
}

let shownScore = 0;

export function updateHud() {
  levelEl.textContent = G.level;
  linesEl.textContent = G.lines;

  if (G.score < shownScore) {
    shownScore = G.score;
    scoreEl.textContent = shownScore.toLocaleString();
  }

  const chained = G.combo > 0;
  comboStat.hidden = !chained;
  if (chained) comboEl.textContent = (G.combo + 1) + '×';
}

export function tickScore() {
  if (shownScore === G.score) return;
  const gap = G.score - shownScore;
  shownScore = gap > 0 ? Math.min(G.score, shownScore + Math.max(1, Math.ceil(gap * 0.2))) : G.score;
  scoreEl.textContent = shownScore.toLocaleString();
}

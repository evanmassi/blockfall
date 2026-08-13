// Overlay screens, HUD text and the markup helpers. Owns no game rules; game.js
// composes these into the menu, pause and game-over screens.

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
    phase: Math.random(), // where in its fall it starts, as a fraction
  }));
}

let field = null;

/**
 * @param {number} [drifted]  seconds the field has already been falling. A
 *   re-render rebuilds these elements from scratch, which restarts their
 *   animations — passing the elapsed time as extra negative delay picks each
 *   block up where it was instead of throwing it back to where it started.
 *   Omit for a new field.
 */
export function menuBackdrop(drifted) {
  if (drifted === undefined) field = debrisField();
  const bits = field.map(({ d, type, left, sign, phase }) => {
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
      animation-delay:-${(phase * dur + (drifted ?? 0)).toFixed(1)}s;"></canvas>`;
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
 * @param {{soft?: boolean, intro?: boolean, modal?: boolean}} [opts]
 *   soft  — lighter backdrop, board readable behind it (pause).
 *   intro — stage contents in after the title drop. Off anywhere that must
 *           appear instantly.
 *   modal — a screen reached from another screen. Suppresses the pause screen's
 *           tap-anywhere, which would otherwise resume out from under it.
 *   picking — a list is open over the screen; everything else stands down so
 *           the accent is only on the thing being asked about.
 */
export function showOverlay(html, opts = {}) {
  stopWheels(); // before the markup goes, so nothing pending outlives its wheel
  overlay.innerHTML = html;
  overlay.classList.toggle('soft', !!opts.soft);
  overlay.classList.toggle('intro', !!opts.intro);
  overlay.classList.toggle('modal', !!opts.modal);
  overlay.classList.toggle('picking', !!opts.picking);
  overlay.classList.remove('hidden');
  setChrome(opts.soft ? 'soft' : 'overlay');
  paintOverlayCanvases();

  // Bound on the button itself; stopPropagation keeps the tap from also
  // reaching the overlay's tap-anywhere handler, which the two used to race.
  for (const btn of overlay.querySelectorAll?.('[data-act]') || []) {
    // A wheel value listens for the click instead: pointerdown here calls
    // preventDefault, which cancels the scroll the moment a finger lands on a
    // number — and a scroll produces no click, so the two don't collide.
    const onWheel = btn.className?.includes?.('wheelItem');
    btn.addEventListener(onWheel ? 'click' : 'pointerdown', e => {
      e.stopPropagation();
      if (!onWheel) e.preventDefault();
      actionHandler?.(btn.dataset.act);
    });
  }

  syncWheels();
}

// Must match --rowH in the stylesheet; a test holds the two together.
const WHEEL_ROW = 26;

// Every wheel's pending settle. A rebuild throws the elements away, and a timer
// that outlived its wheel read scrollTop from a detached node — which reports 0,
// so it committed the first option on the list. That is what reset the Zen range
// to 1 and 1 whenever the floor pushed the ceiling along.
let pending = [];
function stopWheels() {
  for (const t of pending) clearTimeout(t);
  pending = [];
}

/**
 * Puts each wheel where its value is and commits what it lands on.
 *
 * Scrolling alone has to select, or the band across the middle is decoration and
 * the numbers under it a lie. Committing only when the resting row differs from
 * the one rendered keeps the programmatic scroll below from feeding itself.
 */
function syncWheels() {
  for (const el of overlay.querySelectorAll?.('.wheelScroll') || []) {
    const rows = [...(el.querySelectorAll?.('.wheelItem') || [])];
    // Read rather than captured: the other end of a range is moved by scrolling
    // it, and a stale index would have it report a value it was just given.
    const atNow = () => Number(el.dataset?.at) || 0;
    let settle = 0, frame = 0;

    // The barrel. CSS cannot know how far a row is from the middle, so each one
    // is tilted, shrunk and faded by its own distance as the wheel turns — which
    // is what makes it read as a cylinder rolling rather than a list sliding.
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

    // Waits for the wheel to actually stop. Sampled on a plain timer it read
    // mid-flight — iOS momentum pauses between frames — and rounded to whichever
    // row it happened to be nearest, which is how it landed a number out.
    // Settled means "stopped moving", not "landed on an exact multiple of a
    // row". Snapping rests on fractional pixels at dpr 3, so a tolerance tight
    // enough to mean anything was one the wheel often never met — and the value
    // simply never committed, which is why it took sometimes and not others.
    let resting = NaN;
    const commit = () => {
      if (el.isConnected === false) return; // its screen was rebuilt under it
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
      // Per frame at most: a flick fires scroll far faster than anything paints.
      if (!frame) frame = requestAnimationFrame(curve);
      resting = NaN; // it is moving again; the next check restarts the wait
      arm(90);
    });

    el.scrollTop = atNow() * WHEEL_ROW;
    curve();
  }
}

/**
 * @param {Array<[string, string, string?, string?]>} actions  [action, label,
 *   sub, cls] — sub goes on a second line, which halves how wide a long label
 *   needs to be, and cls carries `on` for a button whose choices are showing or
 *   `variant` for one of those choices. null for a row break. An action with no
 *   branch in input.js's handler produces a button that silently does nothing,
 *   so the two must be kept in step.
 */
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

/** A hairline between menu groups, so starting and resuming don't run together. */
export const rule = () => '<div class="menuRule"></div>';

/** A control that costs a line of text rather than a 46px button row. */
export const textButton = (act, label) =>
  `<button class="textBtn" data-act="${act}">${label}</button>`;

/** Side by side: the overlay is a column, so each one alone costs its own row. */
export const textRow = (...buttons) => `<div class="textBtns">${buttons.join('')}</div>`;

/** The value doubles as the button: there are only two of them to cycle. */
export const toggle = (act, value, on) =>
  `<button class="setToggle${on ? ' on' : ''}" data-act="${act}">${value}</button>`;

/**
 * A picker wheel, ours rather than the platform's. A native `<select>` gets the
 * phone's own wheel for free but arrives in system chrome — white, rounded, the
 * wrong typeface — sitting in the middle of a screen drawn in an 8px pixel font.
 *
 * This is a scroll-snapping list: flick it, it lands on a value, and the band
 * across the middle is the selection. Every option is also a button, so a tap
 * picks it directly and the whole thing works through the same action handler as
 * the rest of the menu.
 *
 * @param {string} key       setting name, used to build the action.
 * @param {Array<[number, string]>} options  [value, label], in wheel order.
 * @param {number} value     the one currently selected.
 */
export const wheel = (key, options, value) => `
  <div class="wheel" data-wheel="${key}">
    <div class="wheelBand" aria-hidden="true"></div>
    <div class="wheelScroll" data-at="${Math.max(0, options.findIndex(([v]) => v === value))}">
      ${options.map(([v, label]) => `
        <button class="wheelItem${v === value ? ' on' : ''}"
                data-act="set-${key}-${v}">${label}</button>`).join('')}
    </div>
  </div>`;

/**
 * The sub line says what the value *means*, so a number never has to be decoded
 * — "5" tells her nothing, "GENTLE 16s TO THE FLOOR" does.
 *
 * Name and meaning are one block, with the control beside them: as a grid the
 * row's height came from whatever control it held, so the sub sat under a
 * toggle and three rows under a wheel, and no two lined up.
 */
export const settingRow = (key, label, control, sub) => `
  <div class="setRow">
    <div class="setText">
      <span class="label">${label}</span>
      <em class="setSub" data-sub="${key}">${sub}</em>
    </div>
    <div class="setCtl">${control}</div>
  </div>`;

/**
 * Rewrites the meaning under each setting without rebuilding the screen.
 *
 * A wheel must not be redrawn by the value it is reporting: the rebuild resets
 * its scroll while iOS momentum is still running, which pulls it out from under
 * the finger and can leave it a number off what was chosen.
 */
/**
 * Turns a wheel to a value it did not choose — the far end of a range being
 * pushed along. Scrolled rather than re-rendered, so the wheel the finger is on
 * is left alone: rebuilding the screen to move the other one is what made the
 * range unreliable.
 */
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

/**
 * The board behind a full-screen overlay. Its accent glow spreads ~38px past
 * its own edges, and at 90% overlay opacity that came through as a soft
 * rectangle whose edges read as seams across the menu. Nothing back there is
 * worth reading on the menu anyway — it says SCORE 0.
 *
 * visibility, not display: resize() measures these boxes.
 */
export function setBoardShowing(on) {
  app.classList.toggle('atMenu', !on);
}

/**
 * The height #app has to span to reach the bottom of the screen.
 *
 * Installed, black-translucent starts the web view at the top of the screen but
 * sizes it to screen-minus-status-bar, so `screen.height` exceeds the viewport
 * by exactly the strip everything was stopping short of. Everywhere else the
 * two agree and this resolves to the viewport.
 */
export function syncScreenHeight() {
  const vp = window.innerHeight || 0;
  // Only an installed iOS app is short of its own screen. Anywhere else the
  // window is legitimately smaller than the display, and screen.height would
  // stretch #app far past the bottom of it — on a desktop it pushed the whole
  // menu down by the difference between the window and the monitor.
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

let undoShown = '';

/**
 * @param {boolean} on    on screen at all — off entirely when undos are unused.
 * @param {number} left   charges remaining.
 * @param {boolean} live  tappable right now.
 */
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

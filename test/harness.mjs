// DOM stub and helpers for the test suite. Stubs just enough of a browser to
// boot the real modules in Node, then re-exports them alongside the tools the
// assertion blocks need.
//
// Everything stateful is reachable through reset() or fresh(). Blocks must not
// depend on state left behind by earlier blocks — that made three separate bugs
// look like faults in the game rather than in the tests.

import fs from 'node:fs';

export const noop = () => {};
const grad = { addColorStop: noop };

const ctxStub = () => {
  const ctx = {
    draws: 0, strokes: 0,
    setTransform: noop, clearRect: noop, fillRect: noop, setLineDash: noop,
    strokeRect: () => { ctx.strokes++; },
    drawImage: () => { ctx.draws++; },
    beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, closePath: noop,
    stroke: noop, fill: noop, translate: noop,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, shadowColor: '', shadowBlur: 0,
  };
  return ctx;
};

export const docHandlers = {}, handlers = {}, els = {};
const IDS = ['app','hud','board','holdCanvas','nextCanvas','overlay','toast','countdown','stage',
             'railLeft','railRight','score','level','lines','comboStat','combo','pauseBtn','muteBtn',
             'undoBtn','undoLeft','sysBtns'];

for (const id of IDS) {
  const listeners = handlers[id] = {};
  const ctx = ctxStub(); // stable per element, so draw counts are observable
  const classes = new Set();
  els[id] = {
    id, style: {}, textContent: '', innerHTML: '', width: 10, height: 10,
    clientWidth: 400, clientHeight: 700,
    classes,
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, v) => { (v ?? !classes.has(c)) ? classes.add(c) : classes.delete(c); },
    },
    ctx,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 60, height: 600, top: 0, left: 0 }),
    offsetHeight: id === 'hud' ? 95 : 0,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    animate: () => ({}),
    setPointerCapture: noop,
  };
}

export const cssVars = {};
export const store = {};
export const metaThemeColor = { content: '', setAttribute: (k, v) => { metaThemeColor.content = v; } };

// Stand-ins for the swatch DOM the theme picker walks and paints into.
export const previewCanvas = () => ({
  clientWidth: 76, clientHeight: 62, width: 0, height: 0, style: {}, getContext: ctxStub,
});
export const markCv = previewCanvas();

export const swatchEls = [];

// showOverlay() binds listeners straight onto the action buttons, so the stub
// has to hand back real-ish elements parsed from the markup it just rendered.
export let actionButtons = [], debrisCanvases = [];
els.overlay.querySelectorAll = sel => {
  // Parsed back out of the markup that was just rendered, the same way the
  // action buttons are — the stub has to hand back something paintable.
  if (sel === '.debrisCv') {
    debrisCanvases = [...els.overlay.innerHTML.matchAll(/data-type="(\w+)" data-cell="(\d+)"/g)]
      .map(m => {
        const ctx = ctxStub(); // stable, so the blocks drawn into it are countable
        return { ...previewCanvas(), ctx, getContext: () => ctx, dataset: { type: m[1], cell: m[2] } };
      });
    return debrisCanvases;
  }
  // A wheel reports its value without the screen being rebuilt, so the sub lines
  // are rewritten in place. Writing back into innerHTML keeps that observable.
  if (sel === '[data-sub]') {
    return [...els.overlay.innerHTML.matchAll(/<em class="setSub" data-sub="(\w+)">([^<]*)<\/em>/g)]
      .map(m => ({
        dataset: { sub: m[1] },
        set textContent(v) {
          els.overlay.innerHTML = els.overlay.innerHTML.replace(m[0], m[0].replace(`>${m[2]}<`, `>${v}<`));
        },
      }));
  }

  if (sel !== '[data-act]') return swatchEls;
  actionButtons = [...els.overlay.innerHTML.matchAll(/data-act="([^"]+)"/g)].map(m => {
    const listeners = {};
    return {
      dataset: { act: m[1] },
      listeners,
      addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    };
  });
  return actionButtons;
};
els.overlay.querySelector = sel => (sel === '.markL' ? markCv : null);

export function fakeSwatch(name) {
  const el = { dataset: { theme: name }, on: false, querySelector: () => previewCanvas() };
  el.classList = { toggle: (_cls, v) => { el.on = v; } };
  return el;
}

const rafQueue = [];
const oscNode = { connect: n => n, start: noop, stop: noop, type: '', frequency: { setValueAtTime: noop } };
const gainNode = { gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: n => n };

/** documentElement.style, so the page background is observable — it is what iOS
 *  fills the strip outside the page with once installed. */
export const docStyle = { setProperty: (k, v) => { cssVars[k] = v; } };

globalThis.document = {
  hidden: false,
  documentElement: { style: docStyle },
  getElementById: id => els[id],
  querySelector: () => metaThemeColor,
  createElement: () => ({ width: 10, height: 10, style: {}, getContext: ctxStub }),
  addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); },
};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
globalThis.requestAnimationFrame = fn => rafQueue.push(fn);
globalThis.location = { search: '' };
globalThis.getComputedStyle = () => ({ paddingTop: '0px', paddingBottom: '0px' });
// Node supplies a read-only `navigator` with no serviceWorker, so main.js's
// registration guard short-circuits on its own.
globalThis.window = {
  devicePixelRatio: 2,
  addEventListener: noop,
  visualViewport: undefined,
  AudioContext: function () {
    return { state: 'running', resume: noop, currentTime: 0, destination: {},
             createOscillator: () => oscNode, createGain: () => gainNode };
  },
};

// ---------- the modules under test ----------

export const config = await import('../src/config.js');
export const {
  COLS, ROWS, HIDDEN, LOCK_DELAY, CLEAR_FX, DEATH_ROW_MS, DEATH_HOLD_MS, READY_MS,
  UNDO_MAX, ZEN_CAPS, DEFAULT_SETTINGS, GRAVITY_FRAMES, FRAME_MS,
} = config;
export const { ROTATIONS, TYPES, topRow } = await import('../src/pieces.js');
export const state = await import('../src/state.js');
export const { G, loadRun, SLOTS, BASES, slotOf, parseSlot } = state;
export const { THEMES, theme, savedThemeName } = await import('../src/themes.js');
export const board = await import('../src/board.js');
export const game = await import('../src/game.js');
export const { applyTheme, view, syncLevelPalette } = await import('../src/render.js');
export const { INSET_MARKS, NES_MARKS } = await import('../src/sprites.js');
export const { Haptics, HAPTIC_CLEAR_PATTERNS } = await import('../src/haptics.js');
export const { updateHud, themeBar } = await import('../src/ui.js');
await import('../src/main.js'); // boots: theme, resize, menu, loop

// Long enough to outlast the slowest clear animation. Derived rather than
// exported from config, because only the tests have a use for it.
export const CLEAR_TIME_MAX = Math.max(...CLEAR_FX.filter(Boolean).map(f => f.time));

/** game.js has no need for this predicate, so the tests use the storage API. */
export const hasSavedRun = mode => !!loadRun(mode);

// ---------- time ----------

let clock = 0;
export const now = () => clock;

export function pumpMs(ms, step = 16.7) {
  for (let acc = 0; acc < ms; acc += step) {
    clock += step;
    for (const cb of rafQueue.splice(0, rafQueue.length)) cb(clock);
  }
}

/** Past the death curtain and its hold, so the game-over screen is up. */
export const pumpPastDeath = () => pumpMs(DEATH_ROW_MS * ROWS + DEATH_HOLD_MS + 200);

// ---------- assertions ----------

let pass = 0, fail = 0;

export function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

export function section(name) { console.log('\n' + name); }

export function report() {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

// ---------- world setup ----------

export const blankStats = () =>
  Object.fromEntries(state.SLOTS.map(s => [s, { score: 0, lines: 0, combo: 0 }]));

/**
 * Returns the world to a known state without starting a game: storage wiped,
 * records blank, Neon applied, haptics back to their defaults.
 *
 * Every block calls this (or fresh) first. Leaning on whatever the previous
 * block left behind is how assertions end up passing for the wrong reason.
 */
export function reset({ stats = blankStats(), themeName = 'neon' } = {}) {
  for (const k of Object.keys(store)) delete store[k];

  // Zero the live run *before* showing the menu. showMenu commits stats, so a
  // score left over from the previous block would otherwise be written straight
  // into the freshly blanked records — the exact leak this function exists to
  // prevent, which it originally had itself.
  // 'menu' before showMenu, so its snapshot has nothing to write: a run left
  // going by the last block was landing in a slot this one is about to assert on.
  G.state = 'menu';
  G.mode = 'marathon';
  G.cascade = false;
  // The bag too, or a block that draws pieces inherits whatever fraction of one
  // the last block left behind — which is how "700 draws, 100 of each" started
  // depending on nobody having played a game before it.
  G.bag = null;
  G.queue = [];
  G.score = 0;
  G.lines = 0;
  G.level = 1;
  G.combo = -1;
  // Merged, so a block naming only the modes it cares about still gets a
  // complete stats object — every mode must have a bucket.
  G.stats = { ...blankStats(), ...stats };
  // Settings live on G, not in the store, so wiping storage alone would let one
  // block's undo count leak into the next.
  G.settings = { ...DEFAULT_SETTINGS };

  Haptics.supported = false;
  Haptics.enabled = true;
  applyTheme(themeName);
  game.showMenu();
}

/**
 * A running game on an empty board. Does *not* wipe records or storage — call
 * reset() first if the block needs a clean world, which is what block setup is
 * for; this is for restarting within a block.
 */
export function fresh(slot = 'marathon') {
  const { mode, cascade } = state.parseSlot(slot);
  game.startGame(mode, cascade);
  pumpMs(20);
  clearGrid();
}

// ---------- board helpers ----------

export function clearGrid() {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) G.grid[y][x] = null;
}

export function fillRow(y, exceptX) {
  for (let x = 0; x < COLS; x++) G.grid[y][x] = x === exceptX ? null : 'I';
}

export function fillFrom(row, type = 'T') {
  for (let y = row; y < ROWS; y++) for (let x = 0; x < COLS; x++) G.grid[y][x] = type;
}

export function put(type, x, y, rot) {
  G.active = { type, rot, x, y, m: ROTATIONS[type][rot] };
}

export const filledCells = () => G.grid.flat().filter(Boolean).length;

// ---------- input helpers ----------

export function key(k) {
  for (const fn of docHandlers.keydown || []) fn({ key: k, repeat: false, preventDefault: noop });
  for (const fn of docHandlers.keyup || []) fn({ key: k });
}

/** A target whose closest() only matches the given selector. */
export const targetMatching = (sel, dataset = {}) => ({
  closest: q => (q === sel ? { dataset } : null),
});
export const backdropTarget = { closest: () => null };

/**
 * A touch tap on the overlay: the touch event, then the compatibility mouse
 * event the browser emits at the same coordinates a moment later. Firing only
 * the first would model a mouse, and miss the ghost-event class of bug entirely.
 */
export function tapOverlay(target, ghostTarget = target) {
  const fire = (pointerType, t) => {
    for (const fn of handlers.overlay.pointerdown || []) {
      fn({ pointerType, button: 0, target: t, timeStamp: clock, preventDefault: noop });
    }
  };
  clock += 400;
  fire('touch', target);
  clock += 50;
  fire('mouse', ghostTarget);
}

/** Presses an overlay action button the way the DOM would — the listener is on
 *  the button itself, so going through the overlay would just be "tap anywhere". */
export function pressAction(act) {
  const btn = actionButtons.find(b => b.dataset.act === act);
  if (!btn) throw new Error(`no action button for "${act}"`);
  for (const fn of btn.listeners.pointerdown || []) {
    fn({
      pointerType: 'touch', button: 0, target: btn, timeStamp: clock,
      stopPropagation: noop, preventDefault: noop,
    });
  }
}

/** The undo button, tapped where it lives: inside #stage, which also listens. */
export function tapUndo() {
  for (const fn of handlers.undoBtn.pointerdown || []) {
    fn({ pointerId: 9, pointerType: 'touch', button: 0, target: els.undoBtn,
         clientX: 200, clientY: 300, timeStamp: clock,
         stopPropagation: noop, preventDefault: noop });
  }
}

/** Drives a gesture across the board. `samples` are [dy, dt] pairs. */
export function dragOnStage(id, samples, dx = 0) {
  let ts = clock, x = 200, y = 300;
  const fire = (type, ev) => { for (const fn of handlers.stage[type] || []) fn(ev); };

  fire('pointerdown', { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, timeStamp: ts });
  for (const [dy, dt] of samples) {
    x += dx; y += dy; ts += dt;
    fire('pointermove', { pointerId: id, clientX: x, clientY: y, timeStamp: ts });
  }
  fire('pointerup', { pointerId: id, clientX: x, clientY: y, timeStamp: ts + 15 });
  clock = ts + 20;
}

export { fs };

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
  const ctx = ctxStub();
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

export const previewCanvas = () => ({
  clientWidth: 76, clientHeight: 62, width: 0, height: 0, style: {}, getContext: ctxStub,
});
export const markCv = previewCanvas();

export const swatchEls = [];

export let actionButtons = [], debrisCanvases = [];
els.overlay.querySelectorAll = sel => {
  if (sel === '.debrisCv') {
    debrisCanvases = [...els.overlay.innerHTML.matchAll(/data-type="(\w+)" data-cell="(\d+)"/g)]
      .map(m => {
        const ctx = ctxStub();
        return { ...previewCanvas(), ctx, getContext: () => ctx, dataset: { type: m[1], cell: m[2] } };
      });
    return debrisCanvases;
  }
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
// PITFALL: navigator is left unstubbed; Node's is read-only and has no serviceWorker, which is what skips registration.
globalThis.window = {
  devicePixelRatio: 2,
  addEventListener: noop,
  visualViewport: undefined,
  AudioContext: function () {
    return { state: 'running', resume: noop, currentTime: 0, destination: {},
             createOscillator: () => oscNode, createGain: () => gainNode };
  },
};

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
await import('../src/main.js');

export const CLEAR_TIME_MAX = Math.max(...CLEAR_FX.filter(Boolean).map(f => f.time));

export const hasSavedRun = mode => !!loadRun(mode);

let clock = 0;
export const now = () => clock;

export function pumpMs(ms, step = 16.7) {
  for (let acc = 0; acc < ms; acc += step) {
    clock += step;
    for (const cb of rafQueue.splice(0, rafQueue.length)) cb(clock);
  }
}

export const pumpPastDeath = () => pumpMs(DEATH_ROW_MS * ROWS + DEATH_HOLD_MS + 200);

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

export const blankStats = () =>
  Object.fromEntries(state.SLOTS.map(s => [s, { score: 0, lines: 0, combo: 0 }]));

export function reset({ stats = blankStats(), themeName = 'neon' } = {}) {
  for (const k of Object.keys(store)) delete store[k];

  // PITFALL: G.state must be 'menu' before showMenu(), or it snapshots the last block's run into the blank records.
  G.state = 'menu';
  G.mode = 'marathon';
  G.cascade = false;
  G.bag = null;
  G.queue = [];
  G.score = 0;
  G.lines = 0;
  G.level = 1;
  G.combo = -1;
  G.stats = { ...blankStats(), ...stats };
  G.settings = { ...DEFAULT_SETTINGS };

  Haptics.supported = false;
  Haptics.enabled = true;
  applyTheme(themeName);
  game.showMenu();
}

export function fresh(slot = 'marathon') {
  const { mode, cascade } = state.parseSlot(slot);
  game.startGame(mode, cascade);
  pumpMs(20);
  clearGrid();
}

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

export function key(k) {
  for (const fn of docHandlers.keydown || []) fn({ key: k, repeat: false, preventDefault: noop });
  for (const fn of docHandlers.keyup || []) fn({ key: k });
}

export const targetMatching = (sel, dataset = {}) => ({
  closest: q => (q === sel ? { dataset } : null),
});
export const backdropTarget = { closest: () => null };

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

export function tapUndo() {
  for (const fn of handlers.undoBtn.pointerdown || []) {
    fn({ pointerId: 9, pointerType: 'touch', button: 0, target: els.undoBtn,
         clientX: 200, clientY: 300, timeStamp: clock,
         stopPropagation: noop, preventDefault: noop });
  }
}

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

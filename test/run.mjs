// Headless test harness. Stubs just enough DOM to boot the real modules, then
// drives the game through the same entry points the browser uses.
//
//   node test/run.mjs

import fs from 'node:fs';

const noop = () => {};
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

const docHandlers = {}, handlers = {}, els = {};
const IDS = ['app','hud','board','holdCanvas','nextCanvas','overlay','toast','stage','railLeft','railRight',
             'score','level','lines','pauseBtn','muteBtn'];

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

const cssVars = {};
const store = {};
const metaThemeColor = { content: '', setAttribute: (k, v) => { metaThemeColor.content = v; } };

// Stand-ins for the swatch DOM the theme picker walks and paints into.
const previewCanvas = () => ({
  clientWidth: 76, clientHeight: 62, width: 0, height: 0, style: {}, getContext: ctxStub,
});
const markCv = previewCanvas();

const swatchEls = [];
// showOverlay() binds listeners straight onto the action buttons, so the stub
// has to hand back real-ish elements parsed from the markup it just rendered.
let actionButtons = [];
els.overlay.querySelectorAll = sel => {
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

function fakeSwatch(name) {
  const el = { dataset: { theme: name }, on: false, querySelector: () => previewCanvas() };
  el.classList = { toggle: (_cls, v) => { el.on = v; } };
  return el;
}
const rafQueue = [];
const oscNode = { connect: n => n, start: noop, stop: noop, type: '', frequency: { setValueAtTime: noop } };
const gainNode = { gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: n => n };

globalThis.document = {
  hidden: false,
  documentElement: { style: { setProperty: (k, v) => { cssVars[k] = v; } } },
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

const { COLS, ROWS, HIDDEN, LOCK_DELAY, CLEAR_TIME_MAX, CLEAR_FX, DEATH_ROW_MS, DEATH_HOLD_MS } = await import('../src/config.js');
const { ROTATIONS, TYPES, topRow } = await import('../src/pieces.js');
const { G } = await import('../src/state.js');
const { THEMES, theme, savedThemeName } = await import('../src/themes.js');
const board = await import('../src/board.js');
const game = await import('../src/game.js');
const { applyTheme, view } = await import('../src/render.js');
const { INSET_MARKS, NES_MARKS } = await import('../src/sprites.js');
const { Haptics, HAPTIC_CLEAR_PATTERNS } = await import('../src/haptics.js');
const { themeBar } = await import('../src/ui.js');
await import('../src/main.js'); // boots: theme, resize, menu, loop

let clock = 0;
function pumpMs(ms, step = 16.7) {
  for (let acc = 0; acc < ms; acc += step) {
    clock += step;
    for (const cb of rafQueue.splice(0, rafQueue.length)) cb(clock);
  }
}
function key(k) {
  for (const fn of docHandlers.keydown || []) fn({ key: k, repeat: false, preventDefault: noop });
  for (const fn of docHandlers.keyup || []) fn({ key: k });
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function clearGrid() {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) G.grid[y][x] = null;
}
function fresh() { game.startGame(); pumpMs(20); clearGrid(); }
function fillRow(y, exceptX) {
  for (let x = 0; x < COLS; x++) G.grid[y][x] = x === exceptX ? null : 'I';
}
function put(type, x, y, rot) {
  G.active = { type, rot, x, y, m: ROTATIONS[type][rot] };
}

console.log('\nBoot');
{
  // The title's first L is a canvas glyph, so the word isn't one string.
  const menu = els.overlay.innerHTML;
  check('menu rendered on load', menu.includes('<span>B</span>') && menu.includes('OCKFALL'));
  check('wordmark L is a drawn tetromino', menu.includes('class="markL"'));
  check('mark has a floor to land on', menu.includes('markFloor'));
  check('menu has drifting debris behind it', menu.includes('bgfall') && menu.includes('--piece-'));
  // Debris must be real tetrominoes, so each falling piece carries 4 cells.
  const debris = menu.slice(menu.indexOf('bgfall'), menu.indexOf('markWrap'));
  const pieceCount = (debris.match(/<i /g) || []).length;
  const cellCount = (debris.match(/<b /g) || []).length;
  check('debris are real tetrominoes', pieceCount > 0 && cellCount === pieceCount * 4,
        `${pieceCount} pieces, ${cellCount} cells`);
  check('theme synced to CSS vars', cssVars['--accent'] === '#ff2d95', JSON.stringify(cssVars['--accent']));
  check('board sized', els.board.width > 0);
}

console.log('\nOffline packaging');
{
  const root = new URL('../', import.meta.url);
  const read = p => fs.readFileSync(new URL(p, root), 'utf8');
  const exists = p => fs.existsSync(new URL(p, root));

  const sw = read('sw.js');
  const listed = [...new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]))].filter(Boolean);

  const missing = listed.filter(p => !exists(p));
  // cache.addAll() is atomic: one bad path and the worker never installs at all.
  check('every asset the worker caches exists', missing.length === 0, missing.join(', '));

  const modules = fs.readdirSync(new URL('src/', root)).filter(f => f.endsWith('.js'));
  const unlisted = modules.filter(m => !listed.includes('src/' + m));
  check('every source module is in the asset list', unlisted.length === 0, unlisted.join(', '));

  const manifest = JSON.parse(read('manifest.json'));
  const badIcons = manifest.icons.filter(i => !exists(i.src));
  check('every manifest icon exists', badIcons.length === 0, badIcons.map(i => i.src).join(', '));
  check('manifest has a maskable icon', manifest.icons.some(i => i.purpose === 'maskable'));
  check('start_url is relative (works from a subpath)', manifest.start_url.startsWith('./'), manifest.start_url);
  check('scope is relative', manifest.scope.startsWith('./'), manifest.scope);

  const html = read('index.html');
  check('index links the manifest', html.includes('rel="manifest"'));
  check('index links an icon', html.includes('rel="icon"'));

  // A @font-face the worker doesn't cache means fallback type when offline.
  const css = read('style.css');
  const faces = [...css.matchAll(/url\('([^']+)'\)/g)].map(m => m[1]);
  check('every @font-face file exists', faces.every(f => exists(f)), faces.join(', '));
  check('every font is cached by the worker', faces.every(f => listed.includes(f)), faces.join(', '));
  check('font licence shipped alongside it', exists('fonts/OFL.txt'));

  // `#app *` sets touch-action:none and carries an id, so the override for
  // tappable controls has to be id-qualified or it silently loses.
  const flat = css.replace(/\s+/g, ' ');
  check('touch-action override outranks #app *',
        /#app \.menuBtn, #app \.swatch, #app \.sysBtn \{ touch-action:manipulation/.test(flat));

  // Splash motion has to be opt-out, and must never gate starting a game.
  check('motion respects prefers-reduced-motion',
        /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css) &&
        /\.bgfall\s*\{\s*display:\s*none/.test(css.replace(/\s+/g, ' ')));

  check('worker registration resolves against the module', read('src/main.js').includes("new URL('../sw.js', import.meta.url)"));
}

console.log('\nThemes');
{
  const names = Object.keys(THEMES);
  check('themes defined', names.length >= 3, names.join(','));

  const required = ['bg','panel','edge','text','dim','accent','well','gridLine','overlay','boardShadow','flash'];
  const complete = names.every(n =>
    required.every(k => typeof THEMES[n][k] === 'string') &&
    'IJLOSTZ'.split('').every(p => /^#[0-9a-f]{6}$/i.test(THEMES[n].pieces[p])) &&
    ['glow','light','shade'].every(k => typeof THEMES[n].block[k] === 'number') &&
    typeof THEMES[n].block.outline === 'string');
  check('every theme has a complete palette', complete);

  // Repeating colours is a deliberate hardware trait, not an oversight — but
  // only where the theme says so. Anywhere else it means two tetrominoes have
  // silently become the same piece.
  const badPalette = names.filter(n => {
    const unique = new Set(Object.values(THEMES[n].pieces)).size;
    return THEMES[n].sharedPalette ? unique < 2 : unique !== TYPES.length;
  });
  check('piece colours are distinct unless the theme shares a palette',
        badPalette.length === 0, badPalette.join(', '));
  check('NES uses one level triple, not seven colours',
        new Set(Object.values(THEMES.nes.pieces)).size === 3,
        [...new Set(Object.values(THEMES.nes.pieces))].join(' '));

  // This replaced a blunt "every theme must be dark" rule. Darkness was only
  // ever a proxy for the thing that matters — a piece has to read against the
  // well it sits on — and Game Boy's light LCD panel is a legitimate exception.
  const lum = hex => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  const faint = [];
  for (const n of names) {
    const wellLum = lum(THEMES[n].well);
    for (const [piece, hex] of Object.entries(THEMES[n].pieces)) {
      if (Math.abs(lum(hex) - wellLum) < 40) faint.push(`${n}.${piece}`);
    }
  }
  check('every piece reads against its own well', faint.length === 0, faint.join(', '));

  check('every theme has a soft overlay for pause', names.every(n => typeof THEMES[n].overlaySoft === 'string'));

  // An unknown style silently falls back to bevel, which would quietly undo
  // the whole point of a hardware theme.
  const STYLES = ['bevel', 'inset', 'nes'];
  const badStyle = names.filter(n => !STYLES.includes(THEMES[n].block.style));
  check('every theme declares a known block style', badStyle.length === 0, badStyle.join(', '));
  check('the hardware themes do not use the bevel',
        THEMES.gameboy.block.style === 'inset' && THEMES.nes.block.style === 'nes');
  check('Game Boy has no glow', THEMES.gameboy.block.glow === 0);

  // On a monochrome panel the fill pattern is the piece's identity, so a
  // missing or duplicated mark makes two tetrominoes the same block.
  const marks = TYPES.map(t => INSET_MARKS[t]);
  check('every piece has a Game Boy fill mark', marks.every(Boolean), JSON.stringify(INSET_MARKS));
  check('no two pieces share a fill mark', new Set(marks).size === TYPES.length, marks.join(','));

  // NES used two tiles per level, so both must actually appear.
  const nes = TYPES.map(t => NES_MARKS[t]);
  check('every piece has an NES tile', nes.every(Boolean), JSON.stringify(NES_MARKS));
  check('both NES tile designs are used', new Set(nes).size === 2, nes.join(','));

  // A white block with a white corner highlight is invisible; the pale pieces
  // have to be the punched-out ring instead.
  const pale = TYPES.filter(t => lum(THEMES.nes.pieces[t]) > 190);
  check('pale NES pieces use the ring tile', pale.every(t => NES_MARKS[t] === 'ring'),
        pale.map(t => `${t}=${NES_MARKS[t]}`).join(', '));

  applyTheme('aurora');
  check('applyTheme switches the live theme', theme.key === 'aurora', theme.key);
  check('CSS vars follow', cssVars['--accent'] === THEMES.aurora.accent, cssVars['--accent']);
  check('scanlines var follows', cssVars['--scanlines'] === 'none', cssVars['--scanlines']);
  check('soft overlay var follows', cssVars['--overlay-soft'] === THEMES.aurora.overlaySoft, cssVars['--overlay-soft']);
  check('status bar color follows', metaThemeColor.content === THEMES.aurora.bg, metaThemeColor.content);
  check('choice persisted', store['blockfall.theme'] === 'aurora', store['blockfall.theme']);
  check('savedThemeName reads it back', savedThemeName() === 'aurora');

  store['blockfall.theme'] = 'not-a-theme';
  check('unknown saved theme falls back to neon', savedThemeName() === 'neon');

  const bar = themeBar();
  check('theme bar marks the active swatch', bar.includes('data-theme="aurora"') && bar.includes('swatch on'));
  check('theme bar lists every theme', names.every(n => bar.includes(`data-theme="${n}"`)));
  check('swatches render a canvas, not colour chips', bar.includes('swatchCv') && !bar.includes('chips'));

  // A swatch tap must repaint, not start the game.
  swatchEls.length = 0;
  for (const n of names) swatchEls.push(fakeSwatch(n));
  const swatchTarget = { closest: sel => sel === '[data-theme]' ? { dataset: { theme: 'forest' } } : null };
  const before = G.state;
  // pointerdown only — `touch-action: none` means a synthesized click may never
  // arrive on WebKit, so firing click here would hide a real failure.
  for (const fn of handlers.overlay.pointerdown || []) {
    fn({ pointerType: 'touch', button: 0, target: swatchTarget, timeStamp: 0, preventDefault: noop });
  }
  check('tapping a swatch applies that theme', theme.key === 'forest', theme.key);
  check('selection mark moves', swatchEls.find(s => s.dataset.theme === 'forest').on === true);
  check('swatch tap does not start the game', G.state === before, `${before} -> ${G.state}`);

  applyTheme('neon');
}

console.log('\nPiece data');
{
  check('7 types', TYPES.length === 7);
  const counts = TYPES.map(t => ROTATIONS[t].every(m => m.flat().filter(Boolean).length === 4));
  check('every rotation of every piece has 4 cells', counts.every(Boolean));
  check('I spawn row is index 1', topRow(ROTATIONS.I[0]) === 1);
  check('J spawn row is index 0', topRow(ROTATIONS.J[0]) === 0);
}

console.log('\n7-bag randomizer');
{
  const counts = {};
  for (let i = 0; i < 700; i++) { const t = board.nextType(); counts[t] = (counts[t] || 0) + 1; }
  const vals = Object.values(counts);
  check('700 draws yield 100 of each type', vals.length === 7 && vals.every(v => v === 100), JSON.stringify(counts));
}

console.log('\nSpawn placement');
{
  fresh();
  for (let i = 0; i < 7; i++) {
    clearGrid();
    game.spawn();
    const a = G.active;
    check(`${a.type} spawns fully visible`, a.y + topRow(a.m) >= HIDDEN, `y=${a.y} top=${topRow(a.m)}`);
  }
}

console.log('\nLine clear');
{
  fresh();
  const before = G.score;
  fillRow(ROWS - 1, 0);
  put('I', -2, 0, 1); // vertical I lined up on column 0
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('clears 1 line', G.lines === 1, 'lines=' + G.lines);
  check('awards 100 + drop pts', G.score - before >= 100, 'delta=' + (G.score - before));
  // The 3 leftover I-cells above the cleared row must settle down by exactly one.
  check('stack collapsed by one row', G.grid[ROWS - 1].filter(Boolean).length === 1 && G.grid[ROWS - 1][0] === 'I');
  check('no floating remnant above', G.grid[ROWS - 4].every(c => !c));
}

console.log('\nTetris (4 lines)');
{
  fresh();
  const before = G.score;
  for (let y = ROWS - 4; y < ROWS; y++) fillRow(y, 0);
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('clears 4 lines', G.lines === 4, 'lines=' + G.lines);
  check('awards 800 base', G.score - before >= 800, 'delta=' + (G.score - before));
  check('board empty after perfect clear', G.grid.every(r => r.every(c => !c)));
}

console.log('\nClear escalation');
{
  const steps = CLEAR_FX.filter(Boolean);
  for (const k of ['time', 'shake', 'parts', 'spread', 'beam']) {
    const vals = steps.map(f => f[k]);
    check(`${k} rises with every extra line`, vals.every((v, i) => i === 0 || v > vals[i - 1]), vals.join(' < '));
  }

  // Locks a vertical I into a pre-filled well without hard-dropping, so the
  // drop's own shake doesn't contaminate the clear's.
  const measure = rows => {
    fresh();
    G.particles.length = 0;
    G.shake = 0;
    for (let y = ROWS - rows; y < ROWS; y++) fillRow(y, 0);
    put('I', -2, ROWS - 4, 1);
    game.lockPiece();
    const snap = { count: G.clearCount, time: G.clearTime, shake: G.shake, parts: G.particles.length };
    pumpMs(CLEAR_TIME_MAX + 80);
    return snap;
  };

  const one = measure(1), two = measure(2), three = measure(3), four = measure(4);
  check('counts recorded', [one, two, three, four].every((s, i) => s.count === i + 1),
        [one, two, three, four].map(s => s.count).join(','));
  check('hold time escalates', one.time < two.time && two.time < three.time && three.time < four.time,
        [one, two, three, four].map(s => s.time).join(' < '));
  check('shake escalates', one.shake < two.shake && two.shake < three.shake && three.shake < four.shake,
        [one, two, three, four].map(s => s.shake).join(' < '));
  check('particles escalate', one.parts < two.parts && two.parts < three.parts && three.parts < four.parts,
        [one, two, three, four].map(s => s.parts).join(' < '));
  check('a Tetris is a clear step above a single', four.shake >= one.shake * 3 && four.parts >= one.parts * 4,
        `shake ${one.shake}->${four.shake}, parts ${one.parts}->${four.parts}`);

  // A long hard drop must not shake as hard as a Tetris, or the ladder flattens.
  fresh();
  G.shake = 0;
  put('I', 3, 0, 0);
  game.hardDrop();
  check('hard-drop impact stays below a Tetris', G.shake < CLEAR_FX[4].shake, String(G.shake));
  pumpMs(CLEAR_TIME_MAX + 60);
}

console.log('\nT-spin single (rotation must survive a 0-cell hard drop)');
{
  fresh();
  const before = G.score;
  fillRow(ROWS - 1, 4);       // bottom row open at x=4
  G.grid[ROWS - 3][3] = 'I';  // overhang -> third corner
  put('T', 3, ROWS - 3, 0);
  game.rotate(1);
  game.rotate(1);             // now rot2, wedged into the notch
  check('T rotated into the notch', G.active.rot === 2 && G.active.y === ROWS - 3);
  check('detected as full T-spin', game.tSpinType() === 'full', String(game.tSpinType()));
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('scores 800 (T-spin single), not 100', G.score - before === 800, 'delta=' + (G.score - before));
}

console.log('\nSRS wall kick');
{
  fresh();
  G.grid[ROWS - 4][0] = 'I'; // blocks the no-offset rotation
  put('T', 0, ROWS - 5, 0);
  check('rotation succeeds via kick', game.rotate(-1) === true);
  check('piece kicked right by 1', G.active.x === 1, 'x=' + G.active.x);
}

console.log('\nHold');
{
  fresh();
  const first = G.active.type;
  game.holdPiece();
  check('hold slot filled', G.hold === first, String(G.hold));
  check('hold disarmed after use', G.canHold === false);
  const afterFirst = G.active.type;
  game.holdPiece();
  check('second hold is a no-op (no infinite stall)', G.active.type === afterFirst && G.hold === first);
}

console.log('\nHold slot rendering');
{
  fresh();
  els.holdCanvas.ctx.draws = 0;
  els.holdCanvas.ctx.strokes = 0;
  els.nextCanvas.ctx.draws = 0;
  game.spawn();
  check('empty hold slot draws no piece', els.holdCanvas.ctx.draws === 0, String(els.holdCanvas.ctx.draws));
  check('empty hold slot draws a placeholder', els.holdCanvas.ctx.strokes > 0, String(els.holdCanvas.ctx.strokes));
  check('next queue paints', els.nextCanvas.ctx.draws > 0, String(els.nextCanvas.ctx.draws));

  game.holdPiece();
  check('hold slot paints once used', els.holdCanvas.ctx.draws > 0, String(els.holdCanvas.ctx.draws));

  const held = G.hold;
  const current = G.active.type;
  game.lockPiece();          // locking re-arms hold
  pumpMs(CLEAR_TIME_MAX + 60);
  game.holdPiece();
  check('holding again swaps the stashed piece in', G.active.type === held, `${held} -> ${G.active.type}`);
  check('previous piece went to the slot', G.hold !== held, `${G.hold} (was ${held})`);
  check('swap is not the same piece twice', G.hold !== current || held !== current);
}

console.log('\nLock delay');
{
  fresh();
  put('O', 4, ROWS - 2, 0);
  pumpMs(LOCK_DELAY - 150);
  check('still active before lock delay elapses', G.active !== null);
  pumpMs(300);
  check('locked after lock delay', G.grid[ROWS - 1][4] === 'O');
}

console.log('\nBlock out + death curtain');
{
  fresh();
  for (let x = 3; x <= 6; x++) { G.grid[0][x] = 'I'; G.grid[1][x] = 'I'; }
  G.grid[ROWS - 1][0] = 'T';
  game.spawn();
  check('enters dying state, not straight to over', G.state === 'dying', G.state);
  check('curtain starts below the floor', G.deathRow === ROWS, String(G.deathRow));

  pumpMs(DEATH_ROW_MS * 5);
  check('curtain sweeps upward', G.deathRow < ROWS && G.deathRow > HIDDEN, 'deathRow=' + G.deathRow);
  check('still dying mid-sweep', G.state === 'dying', G.state);

  pumpMs(DEATH_ROW_MS * 25 + DEATH_HOLD_MS + 100);
  check('curtain reaches the top', G.deathRow === HIDDEN, String(G.deathRow));
  check('game over shown after the sweep', G.state === 'over', G.state);
  check('overlay rendered', els.overlay.innerHTML.includes('GAME OVER'));
  check('best score persisted', JSON.parse(store['blockfall.stats']).best >= 0);
}

console.log('\nOverlay restart');
{
  const tap = {
    pointerId: 3, pointerType: 'touch', button: 0, clientX: 10, clientY: 10, timeStamp: clock,
    target: { closest: () => null }, // tapped the backdrop, not a swatch
    preventDefault: noop,
  };
  for (const fn of handlers.overlay.pointerdown || []) fn(tap);
  check('tapping the overlay restarts', G.state === 'playing', G.state);
  check('score reset', G.score === 0, String(G.score));
}

console.log('\nTouch gestures');
{
  fresh();
  const stageH = handlers.stage;
  const fire = (type, ev) => { for (const fn of stageH[type] || []) fn(ev); };
  const cell = 24;

  put('T', 4, 5, 0);
  const startX = G.active.x;
  let ts = clock;
  fire('pointerdown', { pointerId: 9, pointerType: 'touch', button: 0, clientX: 200, clientY: 300, timeStamp: ts });
  for (let i = 1; i <= 3; i++) {
    fire('pointermove', { pointerId: 9, clientX: 200 + i * cell, clientY: 300, timeStamp: ts + i * 40 });
  }
  fire('pointerup', { pointerId: 9, clientX: 200 + 3 * cell, clientY: 300, timeStamp: ts + 200 });
  check('horizontal drag moves the piece right', G.active.x > startX, `x ${startX} -> ${G.active.x}`);

  put('T', 4, 5, 0);
  ts = clock;
  fire('pointerdown', { pointerId: 10, pointerType: 'touch', button: 0, clientX: 200, clientY: 300, timeStamp: ts });
  fire('pointerup', { pointerId: 10, clientX: 201, clientY: 300, timeStamp: ts + 80 });
  check('tap rotates', G.active.rot === 1, 'rot=' + G.active.rot);
}

console.log('\nNew high score');
{
  const clearBottomRow = () => {
    fillRow(ROWS - 1, 0);
    put('I', -2, ROWS - 4, 1);
    game.lockPiece();
    pumpMs(CLEAR_TIME_MAX + 80);
  };

  // First ever game: nothing to beat, so scoring at all must not celebrate.
  G.stats = { best: 0, bestLines: 0, bestCombo: 0 };
  game.startGame();
  pumpMs(20);
  clearGrid();
  clearBottomRow();
  check('no fanfare on the first ever game', G.newBest === false, 'score=' + G.score);
  check('score stays unmarked', !els.score.classes.has('record'));

  // With a real target, it fires exactly when the score passes it.
  G.stats = { best: 150, bestLines: 0, bestCombo: 0 };
  game.startGame();
  pumpMs(20);
  clearGrid();
  check('target captured at the start of the run', G.runBest === 150, String(G.runBest));

  clearBottomRow(); // single = 100, still short
  check('silent below the target', G.newBest === false, 'score=' + G.score);
  check('score unmarked below the target', !els.score.classes.has('record'));

  clearBottomRow(); // another 100 + combo, now past 150
  check('fires once past the target', G.newBest === true, 'score=' + G.score);
  check('score element lit for the rest of the run', els.score.classes.has('record'));

  // Game over should acknowledge it rather than showing a flat high score line.
  game.gameOver();
  pumpMs(DEATH_ROW_MS * 25 + DEATH_HOLD_MS + 150);
  check('game over celebrates the record', els.overlay.innerHTML.includes('NEW HIGH SCORE!'));
  check('record persisted as the new best', G.stats.best === G.score, `${G.stats.best} vs ${G.score}`);

  // Starting again clears the marking.
  game.startGame();
  pumpMs(20);
  check('new run resets the flag', G.newBest === false);
  check('new run clears the score marking', !els.score.classes.has('record'));
}

console.log('\nOverlay actions');
{
  // Everything fires pointerdown only. These controls sit under
  // `touch-action: none`, where a synthesized click is not guaranteed to
  // arrive, so a test that fires click would pass against broken code.
  let tapClock = 1000;
  const fireDown = (pointerType, target) => {
    for (const fn of handlers.overlay.pointerdown || []) {
      fn({ pointerType, button: 0, target, timeStamp: tapClock, preventDefault: noop });
    }
  };
  // A real touch tap: the touch event, then the compatibility mouse event the
  // browser emits ~50ms later at the same coordinates. By then the overlay may
  // have been replaced, so the ghost lands on whatever is now underneath.
  const tap = (target, ghostTarget = target) => {
    tapClock += 400;
    fireDown('touch', target);
    tapClock += 50;
    fireDown('mouse', ghostTarget);
  };
  // Buttons are bound directly now, so exercise them the way the DOM would:
  // fire the listener showOverlay attached to the button element itself.
  const pressButton = act => {
    const btn = actionButtons.find(b => b.dataset.act === act);
    for (const fn of btn.listeners.pointerdown || []) {
      fn({ pointerType: 'touch', button: 0, target: btn, timeStamp: tapClock, stopPropagation: noop, preventDefault: noop });
    }
  };
  const button = act => ({ closest: sel => (sel === '[data-act]' ? { dataset: { act } } : null) });
  const backdrop = { closest: () => null };
  // Landed in the button row, but between the buttons.
  const nearMiss = { closest: sel => (sel === '.menuBtns' ? {} : null) };

  check('no overlay behaviour depends on click', !(handlers.overlay.click || []).length);

  game.startGame();
  pumpMs(20);
  game.togglePause();
  const paused = els.overlay.innerHTML;
  check('pause offers a restart', paused.includes('data-act="restart"'));
  check('pause offers a route to the menu', paused.includes('data-act="menu"'));
  check('pause keeps tap-to-resume', paused.includes('TAP TO RESUME'));

  tap(nearMiss);
  check('missing a button does not resume', G.state === 'paused', G.state);

  tap(backdrop);
  check('tapping the backdrop still resumes', G.state === 'playing', G.state);

  game.togglePause();
  pressButton('menu');
  // The compatibility mouse event lands on the menu that just replaced the
  // pause screen — the sequence that made MAIN MENU start a game on touch.
  fireDown('mouse', backdrop);
  check('main menu goes to the menu, not back into the game', G.state === 'menu', G.state);
  check('menu clears the abandoned board', G.grid.every(r => r.every(c => !c)));

  // Abandoning a good run should still keep the score.
  G.stats = { best: 0, bestLines: 0, bestCombo: 0 };
  game.startGame();
  pumpMs(20);
  G.score = 4321;
  G.lines = 12;
  game.showMenu();
  check('abandoned run still records a best', G.stats.best === 4321, String(G.stats.best));

  game.startGame();
  pumpMs(20);
  G.score = 999;
  game.togglePause();
  pressButton('restart');
  fireDown('mouse', backdrop);
  check('restart starts a fresh game', G.state === 'playing' && G.score === 0, `${G.state}/${G.score}`);
}

console.log('\nHaptics');
{
  check('vibration support is detected, not assumed', typeof Haptics.supported === 'boolean');
  check('every clear length has a pattern',
        [1, 2, 3, 4].every(n => Array.isArray(HAPTIC_CLEAR_PATTERNS[n])),
        JSON.stringify(HAPTIC_CLEAR_PATTERNS));
  check('bigger clears get more pulses',
        [1, 2, 3, 4].map(n => HAPTIC_CLEAR_PATTERNS[n].length).every((v, i, a) => i === 0 || v > a[i - 1]),
        [1, 2, 3, 4].map(n => HAPTIC_CLEAR_PATTERNS[n].length).join(' < '));

  // Node has no navigator.vibrate, so this also covers the iPhone case.
  let threw = false;
  try {
    Haptics.lock(); Haptics.drop(); Haptics.hold();
    Haptics.clear(4); Haptics.tspin(); Haptics.levelUp(); Haptics.record(); Haptics.over();
  } catch { threw = true; }
  check('calls are inert where vibration is unavailable', !threw);

  // Movement fires several times a second; buzzing there reads as a fault.
  const src = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const moveBody = src.slice(src.indexOf('export function move('), src.indexOf('export function rotate('));
  check('no haptics on move or rotate', !moveBody.includes('Haptics.'));

  // Neither of us owns a device that vibrates, so the off switch has to be
  // reachable by whoever ends up holding the phone.
  game.startGame();
  pumpMs(20);
  game.togglePause();
  check('no buzz toggle where vibration is unsupported',
        !els.overlay.innerHTML.includes('data-act="haptics"'));

  Haptics.supported = true; // pretend we are on an Android device
  game.showPauseScreen();
  check('buzz toggle offered where it is supported', els.overlay.innerHTML.includes('data-act="haptics"'));
  check('toggle label reflects the current state', els.overlay.innerHTML.includes('BUZZ ON'));

  // Buttons carry their own listeners, so press the element rather than the
  // overlay — going through the overlay would just be "tap anywhere to resume".
  const wasEnabled = Haptics.enabled;
  const btn = actionButtons.find(b => b.dataset.act === 'haptics');
  for (const fn of btn.listeners.pointerdown || []) {
    fn({
      pointerType: 'touch', button: 0, target: btn, timeStamp: 9000,
      stopPropagation: noop, preventDefault: noop,
    });
  }
  check('toggling flips the setting', Haptics.enabled === !wasEnabled);
  check('toggling does not resume the game', G.state === 'paused', G.state);
  check('label updates in place', els.overlay.innerHTML.includes('BUZZ OFF'));
  check('choice is persisted', store['blockfall.haptics'] === '0', store['blockfall.haptics']);

  Haptics.setEnabled(true);
  Haptics.supported = false;
  game.togglePause();
}

console.log('\nRecords on the menu');
{
  G.stats = { best: 8400, bestLines: 63, bestCombo: 5 };
  game.showMenu();
  const menu = els.overlay.innerHTML;
  check('high score shown', menu.includes('8,400'));
  check('most lines shown', menu.includes('MOST LINES') && menu.includes('63'));
  check('best combo shown', menu.includes('BEST COMBO') && menu.includes('5'));

  // Nothing to boast about before the first game.
  G.stats = { best: 0, bestLines: 0, bestCombo: 0 };
  game.showMenu();
  check('records hidden before the first game', !els.overlay.innerHTML.includes('MOST LINES'));
}

console.log('\nResuming a run');
{
  game.startGame();
  pumpMs(20);
  clearGrid();
  G.grid[ROWS - 1][3] = 'T';
  G.grid[ROWS - 1][4] = 'S';
  G.score = 2750; G.lines = 7; G.level = 2; G.hold = 'I';
  game.snapshotRun();

  check('a run in progress is saved', game.hasSavedRun());
  check('board stored compactly', JSON.parse(store['blockfall.run']).grid.length === ROWS * COLS);

  // Simulate a relaunch: wipe live state, then resume from storage alone.
  game.showMenu();
  check('menu still offers the run', game.hasSavedRun());
  check('menu shows a new-game escape hatch', els.overlay.innerHTML.includes('data-act="new"'));
  check('menu prompt reflects the saved run', els.overlay.innerHTML.includes('TAP TO CONTINUE'));

  game.resumeRun();
  check('resumes paused, not into live gravity', G.state === 'paused', G.state);
  check('score restored', G.score === 2750, String(G.score));
  check('lines and level restored', G.lines === 7 && G.level === 2, `${G.lines}/${G.level}`);
  check('hold restored', G.hold === 'I', String(G.hold));
  check('board restored', G.grid[ROWS - 1][3] === 'T' && G.grid[ROWS - 1][4] === 'S');
  check('active piece has a usable rotation matrix', !G.active || Array.isArray(G.active.m));

  // Finishing or abandoning must not leave a stale run behind.
  game.togglePause();
  game.gameOver();
  pumpMs(DEATH_ROW_MS * 25 + DEATH_HOLD_MS + 150);
  check('game over clears the saved run', !game.hasSavedRun());

  game.startGame();
  pumpMs(20);
  game.snapshotRun();
  check('a fresh run saves again', game.hasSavedRun());
  game.startGame();
  pumpMs(20);
  check('starting a new game discards the old one', JSON.parse(store['blockfall.run']).score === 0);

  // A payload from an older schema must be ignored rather than half-loaded.
  store['blockfall.run'] = JSON.stringify({ v: 0, score: 999 });
  check('an incompatible saved run is discarded', !game.hasSavedRun());
  delete store['blockfall.run'];
}

console.log('\nDrop gestures');
{
  const fire = (type, ev) => { for (const fn of handlers.stage[type] || []) fn(ev); };

  const drag = (id, samples) => {
    fresh();
    put('T', 4, 4, 0);
    const piece = G.active;
    let ts = clock, y = 300;
    fire('pointerdown', { pointerId: id, pointerType: 'touch', button: 0, clientX: 200, clientY: y, timeStamp: ts });
    for (const [dy, dt] of samples) {
      y += dy; ts += dt;
      fire('pointermove', { pointerId: id, clientX: 200, clientY: y, timeStamp: ts });
    }
    fire('pointerup', { pointerId: id, clientX: 200, clientY: y, timeStamp: ts + 15 });
    return { piece, dropped: G.active !== piece };
  };

  // Unhurried drag containing one fast sample — the 120Hz false positive that
  // was slamming pieces to the floor mid-drag.
  const blip = drag(20, Array.from({ length: 12 }, (_, i) => (i === 6 ? [14, 8] : [5, 26])));
  check('slow drag with a speed blip does not hard drop', !blip.dropped);
  check('slow drag still soft drops', G.active.y > 4, 'y=' + G.active.y);

  // Sustained fast movement — a genuine flick must still fire.
  const flick = drag(21, Array.from({ length: 5 }, () => [22, 8]));
  check('a deliberate flick still hard drops', flick.dropped);
  pumpMs(CLEAR_TIME_MAX + 60);

  // A brief fast twitch that stops short must not count either.
  const twitch = drag(22, [[20, 8], [18, 8]]);
  check('a short fast twitch does not hard drop', !twitch.dropped);
}

console.log('\nRandom play stress');
{
  game.startGame();
  pumpMs(20);
  let games = 1;
  for (let i = 0; i < 6000; i++) {
    const r = Math.random();
    if (r < 0.28) key('ArrowLeft');
    else if (r < 0.56) key('ArrowRight');
    else if (r < 0.72) key('ArrowUp');
    else if (r < 0.78) key('z');
    else if (r < 0.83) key('c');
    else if (r < 0.88) key('ArrowDown');
    else key(' ');
    pumpMs(34);
    if (G.state === 'dying') pumpMs(DEATH_ROW_MS * 22 + DEATH_HOLD_MS + 100);
    if (G.state === 'over') { games++; game.startGame(); pumpMs(20); }
  }
  check('survived 6000 random inputs', true);
  console.log(`  (games played: ${games})`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

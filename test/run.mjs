// Assertion blocks. The harness stubs the DOM, boots the real modules and
// re-exports them along with the helpers used here.
//
// Every block opens with reset(), which wipes storage, blanks the records and
// re-applies the default theme. Blocks must not inherit state from each other:
// three bugs in this project were masked by assertions that passed only because
// of what a previous block happened to leave behind.

import {
  // harness
  check, section, report, reset, fresh, pumpMs, pumpPastDeath, now, noop, fs, blankStats,
  els, handlers, docHandlers, store, cssVars, metaThemeColor,
  swatchEls, actionButtons, debrisCanvases, fakeSwatch, previewCanvas, markCv,
  // board + input helpers
  clearGrid, fillRow, fillFrom, put, filledCells, key,
  tapOverlay, pressAction, dragOnStage, tapUndo, targetMatching, backdropTarget,
  // modules under test
  COLS, ROWS, HIDDEN, LOCK_DELAY, CLEAR_FX, CLEAR_TIME_MAX, DEATH_ROW_MS, DEATH_HOLD_MS, READY_MS,
  UNDO_MAX, DEFAULT_SETTINGS, GRAVITY_FRAMES, FRAME_MS,
  ROTATIONS, TYPES, topRow,
  G, state, loadRun, hasSavedRun, board, game, SLOTS, BASES, slotOf, parseSlot,
  THEMES, theme, savedThemeName, applyTheme, view, syncLevelPalette,
  INSET_MARKS, NES_MARKS, Haptics, HAPTIC_CLEAR_PATTERNS,
  updateHud as updateHudFromTest, themeBar,
} from './harness.mjs';

const clock = now();

/** Both slots of a mode, in menu order. */
const VARIANTS_FOR = mode => [slotOf(mode, false), slotOf(mode, true)];

section('Boot');
{
  reset();
  // The title's first L is a canvas glyph, so the word isn't one string.
  const menu = els.overlay.innerHTML;
  check('menu rendered on load', menu.includes('<span>B</span>') && menu.includes('OCKFALL'));
  check('wordmark L is a drawn tetromino', menu.includes('class="markL"'));
  check('mark has a floor to land on', menu.includes('markFloor'));
  check('menu has drifting debris behind it', menu.includes('bgfall') && menu.includes('debrisCv'));
  const debris = menu.slice(menu.indexOf('bgfall'), menu.indexOf('markWrap'));
  const types = [...debris.matchAll(/data-type="(\w+)"/g)].map(m => m[1]);
  check('debris are real tetrominoes', types.length > 0 && types.every(t => TYPES.includes(t)),
        types.join(' '));
  check('theme synced to CSS vars', cssVars['--accent'] === '#ff2d95', JSON.stringify(cssVars['--accent']));
  check('board sized', els.board.width > 0);

  // Playing is what she came for; reference and settings sit under it.
  check('the modes come before the text links',
        menu.indexOf('data-act="new-marathon"') < menu.indexOf('data-act="how"'),
        `modes at ${menu.indexOf('data-act="new-marathon"')}, links at ${menu.indexOf('data-act="how"')}`);
  check('and the two links share one row',
        /<div class="textBtns">.*data-act="how".*data-act="settings".*<\/div>/s.test(menu));
}

section('Menu depth field');
{
  reset();
  const field = () => {
    const html = els.overlay.innerHTML;
    return html.slice(html.indexOf('bgfall'), html.indexOf('markWrap'));
  };

  const first = field();
  const pieces = first.match(/<canvas [^>]*>/g) || [];
  const opacity = p => Number(p.match(/opacity:([\d.]+)/)[1]);
  const cell = p => Number(p.match(/data-cell="(\d+)"/)[1]);

  check('the field is the size it claims', pieces.length === 14, String(pieces.length));

  // The whole point of the canvases: each is painted by the real block
  // renderer, so it carries the theme's bevel and Game Boy's fill marks.
  check('every piece is drawn with the real block renderer',
        debrisCanvases.length === 14 && debrisCanvases.every(c => c.ctx.draws === 4),
        debrisCanvases.map(c => c.ctx.draws).join(','));

  // Sizes must stay on the sprite cache's grid, or it grows on every visit.
  check('cell sizes are quantised', pieces.every(p => cell(p) % 2 === 0),
        pieces.map(cell).join(' '));

  const depths = new Set(pieces.map(opacity));
  check('depth varies across it', depths.size > 8, String(depths.size));
  check('and stays inside its range',
        [...depths].every(o => o >= 0.05 && o <= 0.22), [...depths].sort().join(' '));

  // Every property comes off one depth value, so the nearest piece must be the
  // biggest and the sharpest, and the furthest the smallest and softest.
  const nearest = pieces.reduce((a, b) => (opacity(a) >= opacity(b) ? a : b));
  const furthest = pieces.reduce((a, b) => (opacity(a) <= opacity(b) ? a : b));
  check('the nearest piece is in focus', !nearest.includes('filter:blur'), 'near layer blurred');
  check('the furthest is soft', furthest.includes('filter:blur'), 'far layer sharp');
  check('and near reads bigger than far', cell(nearest) > cell(furthest),
        `${cell(nearest)} vs ${cell(furthest)}`);

  // Blur is the expensive part; it must not reach every piece.
  const blurred = pieces.filter(p => p.includes('filter:blur')).length;
  check('only the back of the field carries a filter', blurred >= 7 && blurred <= 11, String(blurred));

  // Lanes, so fourteen random positions cannot clump into one column.
  const lefts = pieces.map(p => Number(p.match(/left:([\d.]+)%/)[1]));
  check('pieces are spread across the width',
        Math.min(...lefts) < 10 && Math.max(...lefts) > 88,
        `${Math.min(...lefts).toFixed(1)}..${Math.max(...lefts).toFixed(1)}`);

  game.showMenu();
  check('the field is rebuilt each visit', field() !== first, 'identical arrangement twice');

  // Game Boy tells pieces apart by fill pattern rather than colour, so a theme
  // change has to redraw the debris, not just recolour them.
  swatchEls.length = 0;
  swatchEls.push(fakeSwatch('gameboy'));
  for (const fn of handlers.overlay.pointerdown || []) {
    fn({
      pointerType: 'touch', button: 0, timeStamp: 0, preventDefault: noop,
      target: { closest: sel => (sel === '[data-theme]' ? { dataset: { theme: 'gameboy' } } : null) },
    });
  }
  check('a theme change repaints them',
        theme.key === 'gameboy' && debrisCanvases.length === 14 &&
        debrisCanvases.every(c => c.ctx.draws === 4),
        `${theme.key} / ${debrisCanvases.map(c => c.ctx.draws).join(',')}`);

  swatchEls.length = 0;
  applyTheme('neon');
}

section('Offline packaging');
{
  reset();
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
  // fullscreen hides the phone's clock and battery for as long as the app is open.
  check('installs standalone, not fullscreen', manifest.display === 'standalone', manifest.display);
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

  // Anything absolutely positioned inside #app must add the safe-area inset to
  // its own offsets. #app's padding does not push it down, because that padding
  // box *is* its containing block — which hid the pause and mute buttons behind
  // the status bar once installed, invisible in a browser tab where insets are 0.
  const sysBtnsRule = /#sysBtns\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check('corner buttons clear the status bar when installed',
        /top:\s*calc\(env\(safe-area-inset-top\)/.test(sysBtnsRule),
        sysBtnsRule.replace(/\s+/g, ' '));
  const overlayRule = /#overlay\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check('overlay content clears the safe areas',
        /padding:\s*calc\(env\(safe-area-inset-top\)/.test(overlayRule),
        'overlay padding ignores insets');

  // `#app *` sets touch-action:none and carries an id, so the override for
  // tappable controls has to be id-qualified or it silently loses.
  const flat = css.replace(/\s+/g, ' ');
  // Every selector in the list, not a fixed list of them: a control added later
  // without the prefix would lose silently and only show up as a dead button.
  const tapRule = /([^{}]+)\{ touch-action:manipulation/.exec(flat)?.[1] ?? '';
  const commentEnd = tapRule.lastIndexOf('*/'); // the rule is preceded by its own comment
  const tapSelectors = tapRule.slice(commentEnd < 0 ? 0 : commentEnd + 2).split(',');
  check('touch-action override outranks #app *',
        tapSelectors.length > 1 && tapSelectors.every(s => s.trim().startsWith('#app ')),
        tapSelectors.join(',') || 'no manipulation rule');
  check('and covers the controls added to the board and settings',
        ['#undoBtn', '.setToggle', '.stepBtn'].every(s => tapSelectors.some(t => t.includes(s))),
        tapSelectors.join(','));

  // #app * would otherwise leave the overlay unscrollable by finger, so a menu
  // taller than the screen loses everything past the fold with no way to reach it.
  check('a too-tall overlay can still be scrolled', /touch-action:\s*pan-y/.test(overlayRule),
        'overlay inherits touch-action:none');
  check('and it is declared after #app *',
        css.indexOf('touch-action:pan-y') > css.indexOf('#app, #app *'),
        'pan-y loses to #app * on source order');

  // Splash motion has to be opt-out, and must never gate starting a game.
  check('motion respects prefers-reduced-motion',
        /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css) &&
        /\.bgfall\s*\{\s*display:\s*none/.test(css.replace(/\s+/g, ' ')));

  check('worker registration resolves against the module', read('src/main.js').includes("new URL('../sw.js', import.meta.url)"));

  // A worker may be killed as soon as respondWith settles. Without waitUntil
  // the revalidation is abandoned mid-flight and an installed app can sit on an
  // old build forever - which is exactly what iOS did.
  check('revalidation is given time to finish', /e\.waitUntil\(/.test(sw), 'background update is fire-and-forget');
  // And it has to reach the server, not the browser's own 10-minute copy.
  check('revalidation bypasses the HTTP cache', /fetch\(req,\s*\{\s*cache:\s*'no-cache'/.test(sw),
        'refetch can be answered from stale bytes');
}

section('Themes');
{
  reset();
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

section('Piece data');
{
  reset();
  check('7 types', TYPES.length === 7);
  const counts = TYPES.map(t => ROTATIONS[t].every(m => m.flat().filter(Boolean).length === 4));
  check('every rotation of every piece has 4 cells', counts.every(Boolean));
  check('I spawn row is index 1', topRow(ROTATIONS.I[0]) === 1);
  check('J spawn row is index 0', topRow(ROTATIONS.J[0]) === 0);
}

section('7-bag randomizer');
{
  reset();
  const counts = {};
  for (let i = 0; i < 700; i++) { const t = board.nextType(); counts[t] = (counts[t] || 0) + 1; }
  const vals = Object.values(counts);
  check('700 draws yield 100 of each type', vals.length === 7 && vals.every(v => v === 100), JSON.stringify(counts));
}

section('Spawn placement');
{
  reset();
  fresh();
  for (let i = 0; i < 7; i++) {
    clearGrid();
    game.spawn();
    const a = G.active;
    check(`${a.type} spawns fully visible`, a.y + topRow(a.m) >= HIDDEN, `y=${a.y} top=${topRow(a.m)}`);
  }
}

section('Line clear');
{
  reset();
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

section('Tetris (4 lines)');
{
  reset();
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

section('Clear escalation');
{
  reset();
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

section('T-spin single (rotation must survive a 0-cell hard drop)');
{
  reset();
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

section('SRS wall kick');
{
  reset();
  fresh();
  G.grid[ROWS - 4][0] = 'I'; // blocks the no-offset rotation
  put('T', 0, ROWS - 5, 0);
  check('rotation succeeds via kick', game.rotate(-1) === true);
  check('piece kicked right by 1', G.active.x === 1, 'x=' + G.active.x);
}

section('Hold');
{
  reset();
  fresh();
  const first = G.active.type;
  game.holdPiece();
  check('hold slot filled', G.hold === first, String(G.hold));
  check('hold disarmed after use', G.canHold === false);
  const afterFirst = G.active.type;
  game.holdPiece();
  check('second hold is a no-op (no infinite stall)', G.active.type === afterFirst && G.hold === first);
}

section('Hold slot rendering');
{
  reset();
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

section('Lock delay');
{
  reset();
  fresh();
  put('O', 4, ROWS - 2, 0);
  pumpMs(LOCK_DELAY - 150);
  check('still active before lock delay elapses', G.active !== null);
  pumpMs(300);
  check('locked after lock delay', G.grid[ROWS - 1][4] === 'O');
}

section('Block out + death curtain');
{
  reset();
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
  check('best score persisted', JSON.parse(store['blockfall.stats']).marathon.score >= 0);
}

section('Starting from the menu');
{
  reset();
  const tap = {
    pointerId: 3, pointerType: 'touch', button: 0, clientX: 10, clientY: 10, timeStamp: clock,
    target: { closest: () => null }, // tapped the backdrop, not a swatch
    preventDefault: noop,
  };
  for (const fn of handlers.overlay.pointerdown || []) fn(tap);
  check('tapping the menu backdrop does nothing', G.state === 'menu', G.state);

  pressAction('new-marathon');
  pressAction('play-marathon');
  check('the button is what starts a game', G.state === 'playing', G.state);
  check('score reset', G.score === 0, String(G.score));
}

section('Touch gestures');
{
  reset();
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

section('New high score');
{
  reset();
  const clearBottomRow = () => {
    fillRow(ROWS - 1, 0);
    put('I', -2, ROWS - 4, 1);
    game.lockPiece();
    pumpMs(CLEAR_TIME_MAX + 80);
  };

  // First ever game: nothing to beat, so scoring at all must not celebrate.
  G.stats = { ...blankStats(), marathon: { score: 0, lines: 0, combo: 0 } };
  game.startGame();
  pumpMs(20);
  clearGrid();
  clearBottomRow();
  check('no fanfare on the first ever game', G.newBest === false, 'score=' + G.score);
  check('score stays unmarked', !els.score.classes.has('record'));

  // With a real target, it fires exactly when the score passes it.
  G.stats = { ...blankStats(), marathon: { score: 150, lines: 0, combo: 0 } };
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
  check('record persisted as the new best', G.stats.marathon.score === G.score,
        `${G.stats.marathon.score} vs ${G.score}`);

  // Starting again clears the marking.
  game.startGame();
  pumpMs(20);
  check('new run resets the flag', G.newBest === false);
  check('new run clears the score marking', !els.score.classes.has('record'));
}

section('Pause screen contents');
{
  reset();
  fresh();
  game.togglePause();
  const paused = els.overlay.innerHTML;

  check('pause offers a restart', paused.includes('data-act="restart"'));
  check('pause offers a route to the menu', paused.includes('data-act="menu"'));
  check('pause keeps tap-to-resume', paused.includes('TAP TO RESUME'));

  // Controls used to appear on the menu only, so once you started playing there
  // was no way to look them up again — the gestures aren't guessable.
  // The gestures aren't guessable, so they must stay reachable mid-game — but as
  // a screen you open, not five rows of the pause screen's height.
  check('pause offers a route to the controls', paused.includes('data-act="how"'),
        'no way to look up the controls');
}

section('The controls screen');
{
  reset();
  pressAction('how');
  const opened = els.overlay.innerHTML;
  check('it lists the controls', opened.includes('class="controls"'), 'no control list');
  const dts = (opened.match(/<dt>/g) || []).length;
  const dds = (opened.match(/<dd>/g) || []).length;
  check('every control is a key/action pair', dts > 0 && dts === dds, `${dts} keys, ${dds} actions`);

  // One pair per row, now that the list has a screen to itself: doubled up, the
  // eye had to find where each row started.
  const rule = /\.controls \{([^}]*)\}/.exec(fs.readFileSync('style.css', 'utf8').replace(/\s+/g, ' '));
  check('listed one to a row, not two', /grid-template-columns:auto auto;/.test(rule?.[1] ?? ''),
        rule?.[1]?.trim() ?? 'no .controls rule');
  check('the hold gesture is spelled out', /hold/i.test(opened), 'hold gesture not documented');

  pressAction('back');
  check('back returns to the menu', G.state === 'menu' && els.overlay.innerHTML.includes('markWrap'), G.state);

  fresh();
  game.togglePause();
  pressAction('how');
  check('reachable from pause too', els.overlay.innerHTML.includes('class="controls"'));
  check('board stays readable behind it', els.overlay.classes.has('soft'));

  // Pause is a tap-anywhere surface; without the modal guard, reading the
  // controls would drop you back into the game on the first stray tap.
  tapOverlay(backdropTarget);
  check('a stray tap does not resume out from under it', G.state === 'paused', G.state);

  pressAction('back');
  check('back returns to pause, still paused',
        G.state === 'paused' && els.overlay.innerHTML.includes('PAUSED'), G.state);
  check('and the modal guard is lifted', !els.overlay.classes.has('modal'));

  // One list, one call site — both screens route here rather than each rendering
  // their own, which is how the two used to drift apart.
  const gameSrc = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const uses = (gameSrc.match(/controlsHint\(\)/g) || []).length;
  check('one control list, reached from both screens', uses === 2, `controlsHint appears ${uses} times`);
}

section('Overlay taps');
{
  reset();
  // Everything fires pointerdown only. These controls sit under
  // `touch-action: none`, where a synthesized click is not guaranteed to
  // arrive, so a test that fires click would pass against broken code.
  check('no overlay behaviour depends on click', !(handlers.overlay.click || []).length);

  // Landed in the button row, but between the buttons.
  const nearMiss = targetMatching('.menuBtns');

  fresh();
  game.togglePause();
  tapOverlay(nearMiss);
  check('missing a button does not resume', G.state === 'paused', G.state);

  tapOverlay(backdropTarget);
  check('tapping the backdrop still resumes', G.state === 'playing', G.state);
}

section('Leaving a run from the pause screen');
{
  reset();
  fresh();
  game.togglePause();
  pressAction('menu');
  // No ghost event is fired here on purpose. The button's own handler calls
  // preventDefault, which suppresses the compatibility mouse event at source —
  // that is what stopped MAIN MENU from starting a game on touch. The ghost path
  // through the overlay itself is covered by tapOverlay in the block above.
  check('main menu goes to the menu, not back into the game', G.state === 'menu', G.state);
  check('menu clears the abandoned board', G.grid.every(r => r.every(c => !c)));
}

section('Restart and abandoned runs');
{
  reset();
  // Abandoning a good run should still keep the score.
  fresh();
  G.score = 4321;
  G.lines = 12;
  game.showMenu();
  check('abandoned run still records a best', G.stats.marathon.score === 4321, String(G.stats.marathon.score));

  fresh();
  G.score = 999;
  game.togglePause();
  pressAction('restart');
  check('restart starts a fresh game', G.state === 'playing' && G.score === 0, `${G.state}/${G.score}`);

  // Restart used to drop the run without recording it, deleting a live best.
  reset({ stats: { marathon: { score: 500, lines: 5, combo: 2 }, zen: { score: 0, lines: 0, combo: 0 } } });
  fresh();
  G.score = 9000;
  G.lines = 60;
  game.togglePause();
  pressAction('restart');
  check('restart keeps the record it was beating', G.stats.marathon.score === 9000, String(G.stats.marathon.score));
  check('restart keeps the lines too', G.stats.marathon.lines === 60, String(G.stats.marathon.lines));
}

section('Zen rules');
{
  reset();
  fresh('zen');
  check('mode recorded', G.mode === 'zen', G.mode);

  // Speed stops climbing, or "endless" would only mean "later".
  const at = lvl => { const p = G.level; G.level = lvl; const ms = game.gravityInterval(); G.level = p; return ms; };
  check('gravity caps for zen', at(5) === at(20), `${Math.round(at(5))}ms vs ${Math.round(at(20))}ms`);
  const zenCap = at(20);
  G.mode = 'marathon';
  check('marathon keeps accelerating', at(20) < zenCap, `${Math.round(at(20))}ms vs ${Math.round(zenCap)}ms`);
  G.mode = 'zen';

  // Filled to the very top, so the spawn genuinely collides. Filling from just
  // below the buffer is not enough — a piece still settles in above it.
  fillFrom(0);
  const before = filledCells();
  game.spawn();
  check('topping out does not end a zen run', G.state === 'playing', G.state);
  check('a piece is still in play', G.active !== null);
  check('room was cleared', filledCells() < before, `${before} -> ${filledCells()}`);
  check('the top of the well is free', G.grid[HIDDEN].every(c => !c));
}

section('Records stay in their own mode');
{
  reset({ stats: { marathon: { score: 5000, lines: 40, combo: 3 }, zen: { score: 0, lines: 0, combo: 0 } } });

  // An endless run would own a shared record forever, so zen must not write to
  // marathon's — nor marathon to zen's.
  fresh('zen');
  G.score = 999999;
  G.lines = 250;
  game.showMenu();
  check('zen leaves the marathon score alone', G.stats.marathon.score === 5000, String(G.stats.marathon.score));
  check('zen leaves marathon lines alone', G.stats.marathon.lines === 40, String(G.stats.marathon.lines));
  check('zen records its own lines', G.stats.zen.lines === 250, String(G.stats.zen.lines));
  check('zen records its own score', G.stats.zen.score === 999999, String(G.stats.zen.score));
  check('zen gets its own record card', els.overlay.innerHTML.includes('>ZEN<'));

  reset({ stats: { marathon: { score: 100, lines: 5, combo: 2 }, zen: { score: 200, lines: 9, combo: 3 } } });
  fresh('marathon');
  G.score = 5000;
  G.lines = 30;
  game.showMenu();
  check('a marathon run cannot touch zen records',
        G.stats.zen.score === 200 && G.stats.zen.lines === 9,
        `${G.stats.zen.score}/${G.stats.zen.lines}`);
  check('and does update its own', G.stats.marathon.score === 5000 && G.stats.marathon.lines === 30);
  // The grid always holds all four, so an empty slot reads as a gap to fill
  // rather than as a mode that does not exist.
  const cards = els.overlay.innerHTML.match(/recordCard/g) || [];
  const blanks = els.overlay.innerHTML.match(/recordCard empty/g) || [];
  check('every slot has a cell on the menu', cards.length === 4, String(cards.length));
  check('and the two never played read as empty', blanks.length === 2, String(blanks.length));

  reset({ stats: { marathon: { score: 0, lines: 0, combo: 0 }, zen: { score: 4200, lines: 90, combo: 4 } } });
  fresh('zen');
  check('zen has its own record to chase', G.runBest === 4200, String(G.runBest));
}

section('Saved runs, one slot per mode');
{
  reset();

  fresh('zen');
  G.lines = 42;
  game.showMenu();

  fresh('marathon');
  G.score = 3210;
  game.showMenu();
  const menu = els.overlay.innerHTML;

  check('starting marathon left the zen run alone', hasSavedRun('zen'));
  // One run going in each mode, so neither needs a question asked of it.
  check('each mode resumes in one tap',
        menu.includes('data-act="go-marathon"') && menu.includes('data-act="go-zen"'));
  check('carrying which clears it was and how far it got',
        /data-act="go-marathon">RESUME CLASSIC<em>NORMAL · 3,210<\/em>/.test(menu),
        'resume button lost its progress');

  // A plain tap picks up whichever was played most recently.
  check('most recent mode is what a plain tap resumes', game.pendingRun() === 'marathon', game.pendingRun());
  game.resumeRun('zen');
  check('resuming zen explicitly works', G.mode === 'zen' && G.lines === 42, `${G.mode}/${G.lines}`);
  game.showMenu();
  check('and becomes the pending one', game.pendingRun() === 'zen', game.pendingRun());
}

section('A saved zen run comes back as zen');
{
  reset();
  // Only a zen slot is occupied, so a plain resume cannot pick anything else.
  // A relaunch is simulated by resetting the live mode, since startGame would
  // clear the very slot under test.
  fresh('zen');
  G.lines = 13;
  game.snapshotRun();
  G.mode = 'marathon';
  game.resumeRun();
  check('a resumed zen run is still zen', G.mode === 'zen', G.mode);
  check('and brings its progress back', G.lines === 13, String(G.lines));
}

section('Menu wording');
{
  reset();
  fresh('zen');
  G.lines = 42;
  game.showMenu();
  const menu = els.overlay.innerHTML;

  check('menu offers zen', menu.includes('data-act="new-zen"'));
  check('no tap prompt competing with them', !menu.includes('TAP TO'), 'menu still hints at tapping');
  check('resume button carries its progress',
        /data-act="go-zen">RESUME ZEN<em>NORMAL · 42 LINES<\/em>/.test(menu), 'no progress on button');
  // Bare mode names did not read as "this starts a game" — the verb has to be on
  // the button, not implied by the RESUME beside it.
  check('start buttons say what they do', /data-act="new-zen">NEW ZEN</.test(menu), 'start button lost its verb');
  check('both modes are offered', ['new-marathon', 'new-zen'].every(a => menu.includes(`data-act="${a}"`)));

  // The clears are a second tap on the button itself, not a mode of their own.
  const menuRow = menu.slice(menu.indexOf('class="menuBtns"'));
  check('no menu button names a clear on its own',
        !menuRow.includes('>NORMAL<') && !menuRow.includes('>CASCADE<'),
        'clears shown before being asked for');

  game.openPicker('marathon');
  const opened = els.overlay.innerHTML;
  check('pressing one offers its two clears',
        opened.includes('data-act="play-marathon"') && opened.includes('data-act="play-marathon-cascade"'));
  check('marked as the choice they are', (opened.match(/menuBtn variant/g) || []).length === 2,
        String((opened.match(/menuBtn variant/g) || []).length));
  check('the mode they belong to stays lit', /class="menuBtn on" data-act="new-marathon"/.test(opened));

  // Below, so the row already read doesn't move out from under the thumb.
  check('and they sit below it',
        opened.indexOf('data-act="play-marathon"') > opened.indexOf('data-act="new-marathon"'),
        'clears appeared above the button');
  // Unfilled: a filled background reads as already chosen, and neither is yet.
  const clearsCss = fs.readFileSync('style.css', 'utf8').replace(/\s+/g, ' ');
  check('and are not styled as though already picked',
        !/\.menuBtn\.variant \{[^}]*background:/.test(clearsCss),
        'the unchosen clears carry a fill');

  check('pressing it again puts them away', (game.openPicker('marathon'),
        !els.overlay.innerHTML.includes('data-act="play-marathon"')));
  check('every slot can be started', BASES.every(mode => {
    game.openPicker(mode);
    const html = els.overlay.innerHTML;
    const ok = VARIANTS_FOR(mode).every(slot => html.includes(`data-act="play-${slot}"`));
    game.openPicker(mode);
    return ok;
  }));
  game.showMenu();

  // Worst case: a run going in all four slots. The top row must not grow with
  // them — that is the whole reason the clears moved inside their mode.
  for (const slot of SLOTS) { fresh(slot); G.score = 3210; G.lines = 42; game.showMenu(); }
  const full = els.overlay.innerHTML;
  const buttons = (full.match(/class="menuBtn[ "]/g) || []).length;
  check('every saved run gets a button of its own', buttons === 6, String(buttons));
  check('one per slot, none doubled up',
        SLOTS.every(slot => (full.match(new RegExp(`data-act="go-${slot}"`, 'g')) || []).length === 1),
        'a slot is missing or listed twice');

  // Which column a run is in is half of how it gets found, so it must not depend
  // on what else happens to be saved.
  check('classic runs sit in the left column',
        (full.match(/class="menuBtn col0" data-act="go-marathon/g) || []).length === 2, 'classic column');
  check('zen runs in the right', (full.match(/class="menuBtn col1" data-act="go-zen/g) || []).length === 2,
        'zen column');
  check('each naming its clears and its score',
        /data-act="go-marathon-cascade">RESUME CLASSIC<em>CASCADE · 3,210<\/em>/.test(full),
        'a saved run gave no way to tell it from the other');

  // Three groups, three rules: starting, resuming, and the rest.
  check('the groups are split by rules', (full.match(/class="menuRule"/g) || []).length === 3,
        String((full.match(/class="menuRule"/g) || []).length));

  game.openPicker('marathon');
  const deepest = els.overlay.innerHTML;
  check('opening the clears adds its two, and no more',
        (deepest.match(/class="menuBtn[ "]/g) || []).length === 8,
        String((deepest.match(/class="menuBtn[ "]/g) || []).length));
  game.showMenu();

  check('with a way to start over beside it', menu.includes('data-act="new-marathon"'));
  // One verb throughout — no CONTINUE anywhere alongside RESUME.
  check('one word for the action, not two', !menu.includes('CONTINUE'), 'mixed CONTINUE and RESUME');
  // And one name per mode: it was GAME on the buttons but marathon in the code.
  check('the other mode is named too', menu.includes('CLASSIC') && !menu.includes('GAME'), 'a mode is still called GAME');

  // "1 LINES" was on screen. Wants a clean store: with a run going in both of
  // Zen's slots the button asks which, and carries no number to pluralise.
  reset();
  fresh('zen');
  G.lines = 1;
  game.showMenu();
  check('a single line is not pluralised',
        els.overlay.innerHTML.includes('1 LINE') && !els.overlay.innerHTML.includes('1 LINES'),
        'says 1 LINES');

  fresh('zen');
  G.lines = 2;
  game.showMenu();
  check('two lines are', els.overlay.innerHTML.includes('2 LINES'));
}

section('Legacy run migration');
{
  reset();
  // A run written before the slots were split by mode must not be lost.
  store['blockfall.run'] = JSON.stringify({
    v: 1, mode: 'zen', lines: 7, score: 10, grid: '.'.repeat(ROWS * COLS),
  });
  state.migrateLegacyRun();
  check('a legacy save is rehomed to its mode', hasSavedRun('zen'));
  check('and the old key is cleared', !('blockfall.run' in store));

  // Cascade's own slot, from when it was a mode. A run she left going must come
  // back under the pair it always was, not vanish.
  reset();
  store['blockfall.run.cascade'] = JSON.stringify({
    v: 1, mode: 'cascade', score: 18400, grid: '.'.repeat(ROWS * COLS),
  });
  state.migrateLegacyRun();
  check('a cascade run survives the split', hasSavedRun('marathon-cascade'));
  check('carrying its score', loadRun('marathon-cascade').score === 18400,
        String(loadRun('marathon-cascade').score));
  check('and the mode-era key is gone', !('blockfall.run.cascade' in store));

  // ...and its record along with it.
  reset();
  store['blockfall.stats'] = JSON.stringify({
    marathon: { score: 100, lines: 5, combo: 2 },
    zen: { score: 0, lines: 0, combo: 0 },
    cascade: { score: 9100, lines: 33, combo: 4 },
  });
  const migrated = state.loadStats();
  check('a cascade record lands on classic cascade',
        migrated['marathon-cascade'].score === 9100, JSON.stringify(migrated['marathon-cascade']));
  check('without disturbing classic', migrated.marathon.score === 100, String(migrated.marathon.score));
  check('and the pair that never existed starts blank',
        migrated['zen-cascade'].score === 0, String(migrated['zen-cascade'].score));

  // A resumed cascade run has to know it is one: the flag lives in the payload,
  // not in the slot it was found under.
  reset();
  fresh('marathon-cascade');
  G.score = 500;
  game.snapshotRun();
  check('the save records which clears it was played with',
        loadRun('marathon-cascade').cascade === true,
        JSON.stringify(loadRun('marathon-cascade').cascade));

  // The payload written when cascade was a mode says so in `mode` and has no
  // flag at all. Read literally it came back as plain Classic, and the next
  // snapshot filed it under Classic as well — one run silently becoming two.
  reset();
  store['blockfall.run.cascade'] = JSON.stringify({
    v: 1, mode: 'cascade', score: 18400, lines: 40, level: 3,
    grid: '.'.repeat(ROWS * COLS), queue: ['T', 'S', 'Z', 'L', 'J', 'I', 'O'],
    bag: null, hold: null, canHold: true, combo: -1, backToBack: false,
    runBest: 0, newBest: false,
  });
  state.migrateLegacyRun();
  check('the moved payload is rewritten as the pair, not just relabelled',
        loadRun('marathon-cascade').cascade === true &&
        loadRun('marathon-cascade').mode === 'marathon',
        JSON.stringify(loadRun('marathon-cascade')).slice(0, 90));

  game.resumeRun('marathon-cascade');
  check('and it resumes still cascading', G.cascade === true, String(G.cascade));
  check('with its score intact', G.score === 18400, String(G.score));
  game.snapshotRun();
  check('without leaving a phantom run in the classic slot', !hasSavedRun('marathon'),
        'resuming cascade wrote a second run into normal');

  // Belt and braces: a phone that migrated under the old code has the unrewritten
  // payload sitting in the slot already, so reading has to forgive it too.
  reset();
  store['blockfall.run.marathon-cascade'] = JSON.stringify({
    v: 1, mode: 'cascade', score: 900, grid: '.'.repeat(ROWS * COLS),
    queue: ['T', 'S', 'Z', 'L', 'J', 'I', 'O'],
  });
  game.resumeRun('marathon-cascade');
  check('a payload already migrated by the broken version still cascades',
        G.cascade === true, String(G.cascade));
}

section('HUD polish');
{
  reset();
  const shown = () => Number(String(els.score.textContent).replace(/,/g, '')) || 0;

  game.startGame();
  pumpMs(20);
  check('score display starts at zero', shown() === 0, String(shown()));

  // A big gain should be visibly counting, not already landed.
  G.score = 0;
  game.startGame();
  pumpMs(20);
  G.score = 1200;
  pumpMs(17);
  const midway = shown();
  check('a big gain counts up rather than snapping', midway > 0 && midway < 1200, String(midway));
  pumpMs(1200);
  check('and arrives at the real score', shown() === 1200, String(shown()));

  // Soft-drop points are tiny and must not lag behind the play.
  G.score = 1201;
  pumpMs(17);
  check('small gains land immediately', shown() === 1201, String(shown()));

  // Resetting must not count downward.
  game.startGame();
  pumpMs(17);
  check('a new game zeroes the display at once', shown() === 0, String(shown()));

  G.combo = -1; updateHudFromTest();
  check('combo hidden outside a chain', els.comboStat.hidden === true);
  G.combo = 2; updateHudFromTest();
  check('combo shown during a chain', els.comboStat.hidden === false);
  check('combo counts clears, not the internal index', els.combo.textContent === '3×', els.combo.textContent);
  G.combo = -1; updateHudFromTest();
}

section('Next queue');
{
  reset();
  game.startGame();
  pumpMs(20);
  els.nextCanvas.ctx.draws = 0;
  game.spawn();
  check('taking a piece redraws the queue', els.nextCanvas.ctx.draws > 0, String(els.nextCanvas.ctx.draws));

  // Mid-slide the canvas keeps being repainted; once settled it stops.
  els.nextCanvas.ctx.draws = 0;
  pumpMs(60);
  const during = els.nextCanvas.ctx.draws;
  check('the slide animates over several frames', during > 1, String(during));

  pumpMs(400);
  els.nextCanvas.ctx.draws = 0;
  pumpMs(120);
  check('a settled queue stops repainting', els.nextCanvas.ctx.draws === 0, String(els.nextCanvas.ctx.draws));
}

section('Idle screens stop repainting');
{
  reset();

  const drawsOver = ms => {
    els.board.ctx.draws = 0;
    pumpMs(ms);
    return els.board.ctx.draws;
  };

  game.showMenu();
  pumpMs(60);
  const menu = drawsOver(300);
  check('the menu stops repainting the board', menu === 0, String(menu));

  fresh();
  clearGrid();
  pumpMs(100);
  game.togglePause();
  pumpMs(60);
  const paused = drawsOver(300);
  check('the pause screen stops repainting', paused === 0, String(paused));

  // The picker lives on the pause screen, where the board has stopped drawing.
  els.board.ctx.draws = 0;
  applyTheme('gameboy');
  pumpMs(60);
  check('a theme picked while paused still repaints', els.board.ctx.draws > 0, String(els.board.ctx.draws));

  applyTheme('neon');
  fresh();
  clearGrid();
  put('T', 4, 4, 0);
  const playing = drawsOver(300);
  check('play is never throttled', playing > 100, String(playing));
}

section('NES level palettes');
{
  reset();
  const pals = THEMES.nes.levelPalettes;
  check('ten palettes, one per level in the cycle', pals.length === 10, String(pals.length));
  check('every palette has three slots of valid hex',
        pals.every(p => p.length === 3 && p.every(c => /^#[0-9a-f]{6}$/i.test(c))));
  check('every slot mapping points at a real slot',
        Object.values(THEMES.nes.paletteSlots).every(s => s >= 0 && s <= 2));

  applyTheme('nes');
  const before = G.level;

  G.level = 1;
  syncLevelPalette();
  check('level 1 uses the first palette', theme.pieces.I === pals[0][0], theme.pieces.I);

  G.level = 3;
  syncLevelPalette();
  check('levelling repaints the pieces', theme.pieces.I === pals[2][0], theme.pieces.I);
  check('slot mates move together', theme.pieces.S === theme.pieces.I && theme.pieces.L === theme.pieces.I);
  check('the white slot stays white', theme.pieces.O === '#fcfcfc' && theme.pieces.T === '#fcfcfc');

  G.level = 11;
  syncLevelPalette();
  check('the cycle repeats every ten levels', theme.pieces.I === pals[0][0], theme.pieces.I);

  // theme.pieces is mutated in place, so a shallow copy in setTheme would have
  // let a played game permanently rewrite the source palette.
  check('playing does not corrupt the theme definition',
        THEMES.nes.pieces.I === '#3cbcfc', THEMES.nes.pieces.I);

  G.level = 5;
  applyTheme('neon');
  syncLevelPalette();
  check('themes without level palettes are untouched', theme.pieces.I === THEMES.neon.pieces.I);

  G.level = before;
  applyTheme('neon');
}

section('Gravity curve');
{
  reset();
  const at = lvl => { const prev = G.level; G.level = lvl; const ms = game.gravityInterval(); G.level = prev; return ms; };
  const levels = Array.from({ length: 40 }, (_, i) => i + 1);
  const ms = levels.map(at);

  check('level 1 matches the console, not the guideline', Math.round(at(1)) === 799, String(Math.round(at(1))));
  check('never speeds up as levels rise', ms.every((v, i) => i === 0 || v <= ms[i - 1]));
  check('always a positive interval', ms.every(v => v > 0));

  // The bug this replaced: every level from 14 up ran at an identical speed.
  check('progression continues past level 14', at(20) < at(14), `${Math.round(at(14))}ms -> ${Math.round(at(20))}ms`);
  check('and past level 20', at(30) < at(20), `${Math.round(at(20))}ms -> ${Math.round(at(30))}ms`);

  // No plateau wider than three levels below 20, where the game is actually played.
  let flat = 1, worst = 1;
  for (let i = 1; i < 19; i++) {
    flat = ms[i] === ms[i - 1] ? flat + 1 : 1;
    worst = Math.max(worst, flat);
  }
  check('no plateau longer than 3 levels below 20', worst <= 3, 'longest run: ' + worst);

  check('gentler than the old curve where it is actually played',
        at(8) > 200 && at(5) > 400, `lvl5 ${Math.round(at(5))}ms, lvl8 ${Math.round(at(8))}ms`);
  check('past the table it holds at the floor', Math.round(at(60)) === Math.round(at(35)));
}

section('Haptics');
{
  reset();
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

section('Records on the menu');
{
  reset();
  G.stats = { ...blankStats(), marathon: { score: 8400, lines: 63, combo: 5 } };
  game.showMenu();
  const menu = els.overlay.innerHTML;
  check('high score shown', menu.includes('8,400'));
  check('lines shown', menu.includes('63'));
  check('combo shown', menu.includes('5&times;') || menu.includes('5×'));

  // Nothing to boast about before the first game.
  G.stats = { ...blankStats(), marathon: { score: 0, lines: 0, combo: 0 } };
  game.showMenu();
  check('records hidden before the first game', !els.overlay.innerHTML.includes('recordCard'));
}

section('Resuming a run');
{
  reset();
  game.startGame();
  pumpMs(20);
  clearGrid();
  G.grid[ROWS - 1][3] = 'T';
  G.grid[ROWS - 1][4] = 'S';
  G.score = 2750; G.lines = 7; G.level = 2; G.hold = 'I';
  game.snapshotRun();

  check('a run in progress is saved', hasSavedRun('marathon'));
  check('board stored compactly',
        JSON.parse(store['blockfall.run.marathon']).grid.length === ROWS * COLS);

  // Simulate a relaunch: wipe live state, then resume from storage alone.
  game.showMenu();
  check('menu still offers the run', hasSavedRun('marathon'));
  check('menu shows a new-game escape hatch', els.overlay.innerHTML.includes('data-act="new-marathon"'));
  check('menu offers the run as a button', els.overlay.innerHTML.includes('data-act="go-marathon"'));

  game.resumeRun();
  check('resumes into the game, not onto a second screen', G.state === 'playing', G.state);
  check('and straight into play, with nothing to sit through', G.ready === 0, String(G.ready));
  check('the board is uncovered', els.overlay.classes.has('hidden'));
  check('score restored', G.score === 2750, String(G.score));
  check('lines and level restored', G.lines === 7 && G.level === 2, `${G.lines}/${G.level}`);
  check('hold restored', G.hold === 'I', String(G.hold));
  check('board restored', G.grid[ROWS - 1][3] === 'T' && G.grid[ROWS - 1][4] === 'S');
  check('active piece has a usable rotation matrix', !G.active || Array.isArray(G.active.m));

  pumpMs(50);
  check('and stays alive', G.ready === 0 && G.state === 'playing', `${G.ready}/${G.state}`);

  // Finishing or abandoning must not leave a stale run behind.
  game.gameOver();
  pumpMs(DEATH_ROW_MS * 25 + DEATH_HOLD_MS + 150);
  check('game over clears the saved run', !hasSavedRun('marathon'));

  game.startGame();
  pumpMs(20);
  game.snapshotRun();
  check('a fresh run saves again', hasSavedRun('marathon'));
  game.startGame();
  pumpMs(20);
  // The slot is cleared and then immediately reoccupied by the new run, so the
  // check is that what's saved is the fresh game, not that nothing is.
  check('starting a new game replaces its own slot',
        JSON.parse(store['blockfall.run.marathon']).score === 0,
        String(JSON.parse(store['blockfall.run.marathon']).score));

  // A payload from an older schema must be ignored rather than half-loaded.
  store['blockfall.run.marathon'] = JSON.stringify({ v: 0, score: 999 });
  check('an incompatible saved run is discarded', !hasSavedRun('marathon'));
  delete store['blockfall.run'];
}

section('The countdown between a held board and a live one');
{
  reset();
  fresh();
  clearGrid();
  put('T', 4, 5, 0);

  // Off unless she asks for it: most pauses are a slip, and three seconds is a
  // long time to be told to wait for one.
  const flatY = G.active.y;
  game.togglePause();
  game.togglePause();
  check('un-pausing resumes flat by default',
        G.state === 'playing' && G.ready === 0, `${G.state}/${G.ready}`);
  pumpMs(900);
  check('with gravity live from the first frame', G.active.y > flatY, `${G.active.y} vs ${flatY}`);

  G.settings.countdown = true;
  clearGrid();
  put('T', 4, 5, 0);

  game.togglePause();
  check('pausing cancels any countdown', G.ready === 0, String(G.ready));

  game.togglePause();
  check('un-pausing counts back in once it is switched on',
        G.state === 'playing' && G.ready > 0, `${G.state}/${G.ready}`);

  // A level-1 row takes ~800ms, so this is long enough to catch gravity that never stopped.
  const { x, y, rot } = G.active;
  pumpMs(READY_MS - 100);
  check('gravity is held throughout', G.active.y === y, `${G.active.y} vs ${y}`);

  key('ArrowLeft');
  check('keys do not land either', G.active.x === x, `${G.active.x} vs ${x}`);
  dragOnStage(1, [[0, 20]]);
  check('nor does a tap on the board', G.active.rot === rot, `${G.active.rot} vs ${rot}`);

  pumpMs(READY_MS);
  check('and the piece falls once it clears', G.active && G.active.y > y, String(G.active?.y));

  game.togglePause();
  game.togglePause();
  const beats = [];
  for (let i = 0; i < READY_MS / 50 + 10; i++) {
    const digit = els.countdown.textContent;
    if (digit && digit !== beats[beats.length - 1]) beats.push(digit);
    pumpMs(50);
  }
  check('the count is on screen and steps down', beats.join('') === '321', beats.join('') || 'nothing shown');
  check('and clears itself at the end', els.countdown.textContent === '', els.countdown.textContent);
}

section('Settings are hers, and they stay set');
{
  reset();
  check('the countdown starts off', G.settings.countdown === false);
  check('undos start off', G.settings.undos === 0, String(G.settings.undos));
  check('zen keeps the cap it always had', G.settings.zenCap === DEFAULT_SETTINGS.zenCap,
        String(G.settings.zenCap));

  pressAction('settings');
  check('the menu opens them', els.overlay.innerHTML.includes('SETTINGS'));
  check('modal, so a stray tap cannot start a game behind it', els.overlay.classes.has('modal'));

  pressAction('undos-up');
  check('undos step up', G.settings.undos === 1, String(G.settings.undos));
  check('and the screen redraws to say what that means',
        els.overlay.innerHTML.includes('1 TAKE-BACK EACH GAME'), 'says 1 TAKE-BACKS');
  pressAction('undos-up');
  check('counted properly past one', els.overlay.innerHTML.includes('2 TAKE-BACKS EACH GAME'));
  pressAction('undos-down');

  for (let i = 0; i < 9; i++) pressAction('undos-up');
  check('stopping at the ceiling', G.settings.undos === UNDO_MAX, String(G.settings.undos));
  for (let i = 0; i < 9; i++) pressAction('undos-down');
  check('and at the floor', G.settings.undos === 0, String(G.settings.undos));
  check('which reads as off, not as zero', els.overlay.innerHTML.includes('NO TAKE-BACKS'));

  pressAction('countdown');
  check('the countdown toggles', G.settings.countdown === true);
  check('and says what it will do', els.overlay.innerHTML.includes('3-2-1 BEFORE PLAY RESUMES'));
  pressAction('countdown');
  check('and back again', G.settings.countdown === false);

  // Written through on every change: setting these twice is the whole complaint.
  pressAction('undos-up');
  check('saved as they change', JSON.parse(store['blockfall.settings']).undos === 1,
        store['blockfall.settings']);
  check('and read back on the next launch', state.loadSettings().undos === 1);

  store['blockfall.settings'] = JSON.stringify({ undos: 99, zenCap: 40, countdown: 1 });
  const clamped = state.loadSettings();
  check('a hand-edited store is clamped rather than trusted',
        clamped.undos === UNDO_MAX && clamped.zenCap === DEFAULT_SETTINGS.zenCap && clamped.countdown === true,
        JSON.stringify(clamped));

  pressAction('back');
  check('BACK returns to the menu it came from', els.overlay.innerHTML.includes('data-act="new-marathon"'));

  // Reached from a run, BACK owes her the pause screen instead.
  reset();
  fresh();
  game.togglePause();
  pressAction('settings');
  check('the pause screen opens them too', els.overlay.innerHTML.includes('SETTINGS'));
  check('over a readable board', els.overlay.classes.has('soft'));
  pressAction('back');
  check('and BACK goes back to pause, not to the menu',
        els.overlay.innerHTML.includes('PAUSED') && G.state === 'paused', G.state);
}

section('Zen speed is hers to pick');
{
  reset();
  fresh('zen');
  G.level = 20;
  const capped = game.gravityInterval();
  check('the cap holds gravity back by default',
        capped === GRAVITY_FRAMES[DEFAULT_SETTINGS.zenCap - 1] * FRAME_MS, String(capped));

  G.settings.zenCap = 10;
  check('a higher cap falls faster', game.gravityInterval() < capped, String(game.gravityInterval()));

  G.mode = 'marathon';
  const classic = game.gravityInterval();
  G.settings.zenCap = 1;
  check('and the cap never touches the other modes', game.gravityInterval() === classic,
        `${game.gravityInterval()} vs ${classic}`);

  G.mode = 'zen';
  G.settings.zenCap = 0;
  check('uncapped, zen climbs like classic does', game.gravityInterval() === classic,
        `${game.gravityInterval()} vs ${classic}`);

  reset();
  pressAction('settings');
  for (let i = 0; i < 20; i++) pressAction('zen-up');
  check('the stepper tops out past the last level', G.settings.zenCap === 0, String(G.settings.zenCap));
  check('where it says so in words', els.overlay.innerHTML.includes('KEEPS SPEEDING UP'));
  pressAction('zen-down');
  check('and steps back down to the fastest cap', G.settings.zenCap === 10, String(G.settings.zenCap));
  // A level number means nothing on its own; how long a piece takes to reach the
  // floor is something she can picture without converting it first.
  check('read as a time she can picture, not a level number',
        /RELENTLESS · 2 SECONDS TO THE FLOOR/.test(els.overlay.innerHTML),
        els.overlay.innerHTML.match(/class="setSub">[^<]*/g)?.join(' | ') || 'no sub line');
  for (let i = 0; i < 20; i++) pressAction('zen-down');
  check('down to the slowest', G.settings.zenCap === 1, String(G.settings.zenCap));
}

section('Undo takes the last piece back');
{
  reset();
  fresh();
  check('no button at all while undos are off', els.undoBtn.hidden === true);
  check('and nothing banked to hold it up', G.undoStack.length === 0, String(G.undoStack.length));

  reset();
  G.settings.undos = 3;
  fresh();
  check('the button appears once they are on', els.undoBtn.hidden === false);
  check('showing what is left', els.undoLeft.textContent === '3', String(els.undoLeft.textContent));
  check('but dead on the first piece, with nothing behind it', els.undoBtn.disabled === true);

  const first = G.active.type;
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('a piece lands', filledCells() === 4, String(filledCells()));
  check('and now there is something to take back', els.undoBtn.disabled === false);

  tapUndo();
  check('undo clears it off the board', filledCells() === 0, String(filledCells()));
  check('and hands the same piece back', G.active.type === first, `${G.active.type} vs ${first}`);
  check('a charge is spent', G.undosUsed === 1, String(G.undosUsed));
  check('and counted down on the button', els.undoLeft.textContent === '2', String(els.undoLeft.textContent));

  // Score has to come back with it, or undo is a way to bank points for free.
  reset();
  G.settings.undos = 2;
  fresh();
  G.score = 500;
  fillRow(ROWS - 1, 5);
  game.spawn();          // a stable point holding the board as it now stands
  put('I', 3, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 200);
  check('the clear scores', G.score > 500, String(G.score));
  check('and counts the line', G.lines === 1, String(G.lines));

  tapUndo();
  check('undo gives the score back', G.score === 500, String(G.score));
  check('and the line', G.lines === 0, String(G.lines));
  check('and puts the row back on the board', filledCells() === COLS - 1, String(filledCells()));
}

section('Undo charges run out, and refill on a new game');
{
  reset();
  G.settings.undos = 2;
  fresh();
  for (let i = 0; i < 3; i++) { game.hardDrop(); pumpMs(CLEAR_TIME_MAX + 60); }

  tapUndo();
  tapUndo();
  check('both charges spend', G.undosUsed === 2, String(G.undosUsed));
  check('the button goes dead once they are gone', els.undoBtn.disabled === true);
  check('reading zero', els.undoLeft.textContent === '0', String(els.undoLeft.textContent));

  const stuck = filledCells();
  tapUndo();
  check('and a third tap does nothing at all', filledCells() === stuck, `${filledCells()} vs ${stuck}`);

  fresh();
  check('a new game refills them', G.undosUsed === 0, String(G.undosUsed));
  check('and says so', els.undoLeft.textContent === '2', String(els.undoLeft.textContent));

  // Raising the setting mid-run is spending money she already has, not a reset.
  G.settings.undos = 4;
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  tapUndo();
  check('a charge spent leaves the rest', G.undosUsed === 1 && els.undoLeft.textContent === '3',
        `${G.undosUsed}/${els.undoLeft.textContent}`);

  // The stack cannot grow without bound just because the game is long.
  reset();
  G.settings.undos = UNDO_MAX;
  fresh();
  // Swept between drops: twelve pieces landing in one column would top out long
  // before the stack had a chance to overfill.
  for (let i = 0; i < 12; i++) { game.hardDrop(); pumpMs(CLEAR_TIME_MAX + 60); clearGrid(); }
  check('only as much history as the charges can reach',
        G.undoStack.length <= UNDO_MAX + 1, String(G.undoStack.length));

  // ...and it has to be deep enough to spend every charge back to back.
  let spent = 0;
  for (let i = 0; i < UNDO_MAX; i++) { tapUndo(); spent = G.undosUsed; }
  check('every charge can be spent in a row', spent === UNDO_MAX, String(spent));
}

section('Undo across a pause, a resume and a switch mid-run');
{
  reset();
  G.settings.undos = 3;
  fresh();
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  tapUndo();

  game.snapshotRun();
  game.showMenu();
  check('the button leaves with the board', els.undoBtn.hidden === true);

  game.resumeRun('marathon');
  check('a spent charge stays spent across a resume', G.undosUsed === 1, String(G.undosUsed));
  check('and the button comes back with the count', els.undoLeft.textContent === '2',
        String(els.undoLeft.textContent));

  // Switched on part-way through: she gets undos from here, not for what is
  // already behind her.
  reset();
  fresh();
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  game.togglePause();
  pressAction('settings');
  pressAction('undos-up');
  pressAction('back');
  game.togglePause();
  check('the button arrives without restarting', els.undoBtn.hidden === false);
  check('but there is no history to undo into yet', els.undoBtn.disabled === true);

  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('and it comes alive on the next piece', els.undoBtn.disabled === false);

  // Nothing is recorded while they are off, so history from before the gap
  // would wind the run back further than she ever asked for.
  reset();
  G.settings.undos = 3;
  fresh();
  for (let i = 0; i < 3; i++) { game.hardDrop(); pumpMs(CLEAR_TIME_MAX + 60); clearGrid(); }
  game.togglePause();
  pressAction('settings');
  for (let i = 0; i < 3; i++) pressAction('undos-down');
  check('switching undos off drops the history with them', G.undoStack.length === 0,
        String(G.undoStack.length));
  pressAction('undos-up');
  check('and switching back on starts again from here', G.undoStack.length === 1,
        String(G.undoStack.length));
}

section('Starting another game is a button, not a hint');
{
  reset();
  // reset() snapshots whatever the last block left running, hence the second wipe.
  for (const k of Object.keys(store)) delete store[k];
  game.showMenu();
  const first = els.overlay.innerHTML;
  check('a first-run menu offers a new game outright',
        first.includes('data-act="new-marathon"'), 'classic mode was tap-only');
  check('with the other mode beside it', first.includes('data-act="new-zen"'));
  check('and no resume button with nothing to resume',
        !first.includes('data-act="go-'), 'offered a resume on a blank slate');

  reset();
  fresh('zen');
  G.score = 4200;
  G.lines = 30;
  game.gameOver();
  pumpPastDeath();
  const over = els.overlay.innerHTML;
  check('game over offers a play-again button', over.includes('PLAY AGAIN'), 'main menu was the only button');
  check('and still a route to the menu', over.includes('data-act="menu"'));
  check('and no tap prompt beside them', !over.includes('TAP TO'), 'game over still hints at tapping');

  tapOverlay(backdropTarget);
  check('a stray tap does not restart', G.state === 'over', G.state);

  // Used to hard-code marathon, silently switching mode.
  pressAction('restart');
  check('play again stays in the mode you died in', G.mode === 'zen', G.mode);
  check('and with the clears it was played with', G.cascade === false, String(G.cascade));
  check('and starts from scratch', G.score === 0 && G.lines === 0, `${G.score}/${G.lines}`);
}

section('Cascade gravity');
{
  reset();

  // Cells fall independently, so a piece bridging a hole comes apart and fills
  // it. Rigid clumps were tried first and barely differed from classic: a cleared
  // row leaves an empty band, so everything above it is one clump falling one row.
  clearGrid();
  G.grid[ROWS - 3][1] = 'I'; G.grid[ROWS - 3][2] = 'I'; G.grid[ROWS - 3][3] = 'I';
  G.grid[ROWS - 2][3] = 'O';
  board.settle(G.grid);
  check('unsupported cells drop to the floor',
        G.grid[ROWS - 1][1] === 'I' && G.grid[ROWS - 1][2] === 'I',
        G.grid[ROWS - 1].map(c => c || '.').join(''));
  check('a supported one stacks on its support',
        G.grid[ROWS - 1][3] === 'O' && G.grid[ROWS - 2][3] === 'I',
        `${G.grid[ROWS - 2][3]}/${G.grid[ROWS - 1][3]}`);
  check('nothing is left floating', G.grid[ROWS - 3].every(c => !c),
        G.grid[ROWS - 3].map(c => c || '.').join(''));

  // Several gaps in one column all close, not just the lowest.
  clearGrid();
  G.grid[ROWS - 6][0] = 'T';
  G.grid[ROWS - 4][0] = 'S';
  G.grid[ROWS - 2][0] = 'Z';
  board.settle(G.grid);
  check('a column compacts completely',
        G.grid.map(r => r[0] || '.').join('').endsWith('TSZ'),
        G.grid.map(r => r[0] || '.').join(''));

  // Nothing floating means nothing moves.
  clearGrid();
  fillRow(ROWS - 1, 4);
  const before = G.grid[ROWS - 1].join('|');
  board.settle(G.grid);
  check('a settled board is left alone', G.grid[ROWS - 1].join('|') === before);
}

section('Cascade clears');
{
  reset();
  fresh('marathon-cascade');
  check('cascade rides on top of a mode rather than replacing it',
        G.mode === 'marathon' && G.cascade === true, `${G.mode}/${G.cascade}`);

  // Bottom row complete but for one column, with a lone block stranded two rows
  // up in that column. Clearing the bottom row drops it into the next gap.
  clearGrid();
  fillRow(ROWS - 1, 0);
  fillRow(ROWS - 2, 0);
  G.grid[ROWS - 2][0] = null;
  put('I', -2, ROWS - 4, 1); // vertical I filling column 0
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 80);

  check('the first clear lands', G.lines >= 1, String(G.lines));
  check('chain reset once it settles', G.chain === 0, String(G.chain));

  // A real chain, built by hand. Bottom row is short only column 0; the row above
  // is short columns 0 and 9; a block sits stranded high in column 9. Dropping a
  // vertical I down column 0 completes the bottom row, and when what is left
  // settles, the stranded block falls in to complete it a second time.
  reset();
  fresh('marathon-cascade');
  clearGrid();
  for (let x = 1; x < COLS; x++) G.grid[ROWS - 1][x] = 'I';
  for (let x = 1; x < COLS - 1; x++) G.grid[ROWS - 2][x] = 'I';
  G.grid[ROWS - 5][COLS - 1] = 'T';
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX * 4 + 400);
  check('one clear sets off another', G.lines === 2, String(G.lines));
  check('and the chain is recorded', G.tally.chain === 2, String(G.tally.chain));
  check('the chain closes out', G.chain === 0 && G.state === 'playing', `${G.chain}/${G.state}`);

  // Combo counts placements, not links. One piece cannot run it up.
  reset();
  fresh('marathon-cascade');
  clearGrid();
  for (let y = ROWS - 4; y < ROWS; y++) fillRow(y, 0);
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX * 5 + 400);
  check('one placement is one combo step', G.combo <= 0, String(G.combo));

  // Classic must still collapse rows wholesale rather than cascading.
  reset();
  fresh('marathon');
  clearGrid();
  fillRow(ROWS - 1, 0);
  G.grid[ROWS - 3][5] = 'T'; // floating, and must stay floating
  put('I', -2, ROWS - 4, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 80);
  check('classic leaves overhangs where they are', G.grid[ROWS - 2][5] === 'T',
        G.grid.map(r => r[5] || '.').join(''));

  // The fall has to be watchable: snapping the survivors into place left a
  // chained clear looking like a bonus with nothing to explain it.
  reset();
  fresh('marathon-cascade');
  clearGrid();
  fillRow(ROWS - 1, 0);
  G.grid[ROWS - 4][5] = 'T'; // stranded three rows up, with air beneath it
  put('I', -2, 0, 1);
  game.hardDrop();

  const pumpUntil = (pred, cap = 4000) => {
    for (let t = 0; t < cap && !pred(); t += 16.7) pumpMs(16.7);
    return pred();
  };
  check('a cascade clear settles before it moves on', pumpUntil(() => G.state === 'settling'), G.state);
  check('and reports what is in flight', G.falling?.length > 0, JSON.stringify(G.falling));

  const flight = G.falling.find(f => f.x === 5);
  check('a stranded cell falls to the floor', flight && flight.to === ROWS - 1,
        JSON.stringify(flight));
  check('from where it actually was', flight && flight.from === ROWS - 4, JSON.stringify(flight));
  // The renderer draws in-flight cells itself, so the grid must already be final.
  check('the grid is settled while they are still falling', G.grid[ROWS - 1][5] === 'T',
        G.grid[ROWS - 1].map(c => c || '.').join(''));

  // Pausing mid-fall must come back to the fall, not skip it.
  game.togglePause();
  check('pausing mid-fall has its own state', G.state === 'pausedSettling', G.state);
  pumpMs(600);
  check('and the fall is frozen', G.state === 'pausedSettling', G.state);
  game.togglePause();
  check('resuming returns to the fall', G.state === 'settling', G.state);

  pumpMs(READY_MS + 600);
  check('which finishes on its own', G.falling === null && G.state === 'playing', G.state);

  // Classic collapses rows wholesale, so nothing is ever in flight.
  reset();
  fresh('marathon');
  clearGrid();
  fillRow(ROWS - 1, 0);
  G.grid[ROWS - 4][5] = 'T';
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 200);
  check('classic never settles', G.falling === null && G.state === 'playing', G.state);

  // Records and saves are per slot, so a cascade score cannot flatter classic.
  reset();
  fresh('marathon-cascade');
  G.score = 12000;
  G.lines = 40;
  game.showMenu();
  check('cascade keeps its own record',
        G.stats['marathon-cascade'].score === 12000, String(G.stats['marathon-cascade'].score));
  check('and leaves classic alone', G.stats.marathon.score === 0, String(G.stats.marathon.score));
  check('with its own saved run', hasSavedRun('marathon-cascade'));
  check('offered on the menu', els.overlay.innerHTML.includes('data-act="go-marathon-cascade"'));

  game.resumeRun('marathon-cascade');
  check('and it resumes with cascade clears',
        G.mode === 'marathon' && G.cascade === true && G.score === 12000,
        `${G.mode}/${G.cascade}/${G.score}`);
}

section('Cascade on either mode');
{
  // The pair that never existed before: Zen's rescue with cascade's chains.
  reset();
  fresh('zen-cascade');
  check('zen can be played with cascade clears',
        G.mode === 'zen' && G.cascade === true, `${G.mode}/${G.cascade}`);

  // Topping out rescues rather than ending the run, exactly as plain Zen does.
  clearGrid();
  fillFrom(HIDDEN, 'T');
  put('T', 4, 0, 0);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 400);
  check('and still rescues instead of dying', G.state !== 'dying' && G.state !== 'over', G.state);

  // Rescue shifts whole rows, so it can never strand a cell in mid-air — which
  // is the one way it could have fed a chain that nothing set off.
  check('with nothing left floating', G.falling === null, JSON.stringify(G.falling));

  // Zen's gravity cap is a property of the mode, not of the clears.
  G.level = 20;
  const zenCascade = game.gravityInterval();
  G.cascade = false;
  check('the zen speed cap applies whichever clears are on',
        game.gravityInterval() === zenCascade, String(zenCascade));

  // And the four keep four separate records.
  reset();
  for (const slot of SLOTS) { fresh(slot); G.score = 100; game.showMenu(); }
  check('four slots, four records', SLOTS.every(slot => G.stats[slot].score === 100),
        JSON.stringify(Object.fromEntries(SLOTS.map(s => [s, G.stats[s].score]))));
  check('and four saves', SLOTS.every(slot => hasSavedRun(slot)));
}

section('End-of-run tally');
{
  reset();
  fresh();
  check('a new run starts empty', G.tally.pieces === 0 && G.tally.tetris === 0, JSON.stringify(G.tally));

  // Four filled rows and a vertical I is a tetris and a perfect clear at once.
  for (let y = ROWS - 4; y < ROWS; y++) fillRow(y, 0);
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('pieces counted as they lock', G.tally.pieces === 1, String(G.tally.pieces));
  check('tetrises counted', G.tally.tetris === 1, String(G.tally.tetris));
  check('perfect clears counted', G.tally.perfect === 1, String(G.tally.perfect));

  clearGrid();
  fillRow(ROWS - 1, 4);
  G.grid[ROWS - 3][3] = 'I';
  put('T', 3, ROWS - 3, 0);
  game.rotate(1);
  game.rotate(1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('t-spins counted', G.tally.tspins === 1, String(G.tally.tspins));

  reset();
  fresh();
  const running = G.tally.ms;
  pumpMs(500);
  check('the clock runs while playing', G.tally.ms > running, `${G.tally.ms} vs ${running}`);

  game.togglePause();
  const held = G.tally.ms;
  pumpMs(500);
  check('and stops on pause', G.tally.ms === held, `${G.tally.ms} vs ${held}`);

  game.togglePause();
  pumpMs(300);
  check('and runs again the moment she is back', G.tally.ms > held, `${G.tally.ms} vs ${held}`);

  // Waiting to be let back in is not playing time.
  G.settings.countdown = true;
  game.togglePause();
  const counted = G.tally.ms;
  game.togglePause();
  pumpMs(READY_MS - 200);
  check('and stays stopped through the countdown', G.tally.ms === counted, `${G.tally.ms} vs ${counted}`);

  reset();
  fresh();
  G.tally.pieces = 42;
  G.tally.ms = 90000;
  game.snapshotRun();
  game.showMenu();
  game.resumeRun('marathon');
  check('the tally survives a resume', G.tally.pieces === 42 && G.tally.ms === 90000, JSON.stringify(G.tally));
  game.startGame();
  check('and a new game clears it', G.tally.pieces === 0, String(G.tally.pieces));

  reset();
  fresh();
  G.lines = 34;
  G.level = 4;
  G.tally = { ms: 252000, pieces: 186, tetris: 3, tspins: 1, perfect: 0, combo: 5 };
  game.gameOver();
  pumpPastDeath();
  const card = els.overlay.innerHTML;
  check('the card is on the game-over screen', card.includes('class="tally"'), 'no tally card');
  check('time reads as a clock', card.includes('4:12'), 'no 4:12');
  check('pieces shown', card.includes('186'));
  check('lines folded into it', card.includes('>34<'), 'lines missing from the card');
  check('best combo shown', card.includes('5&times;') || card.includes('5×'));
  // Score stays the headline above the card; only the supporting numbers moved.
  check('score still the hero', card.includes('class="best'), 'score block gone');
}

section('Drop gestures');
{
  reset();
  const fire = (type, ev) => { for (const fn of handlers.stage[type] || []) fn(ev); };

  const drag = (id, samples) => {
    fresh();
    put('T', 4, 4, 0);
    const piece = G.active;
    let ts = clock, x = 200, y = 300, landedX = null;
    fire('pointerdown', { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, timeStamp: ts });
    for (const [dy, dt, dx = 0] of samples) {
      x += dx; y += dy; ts += dt;
      const before = G.active;
      fire('pointermove', { pointerId: id, clientX: x, clientY: y, timeStamp: ts });
      if (landedX === null && G.active !== before) landedX = before.x;
    }
    fire('pointerup', { pointerId: id, clientX: x, clientY: y, timeStamp: ts + 15 });
    return { piece, dropped: G.active !== piece, landedX };
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

  // 45px of thumb arc used to land the piece two columns off target.
  const steps = Array.from({ length: 9 }, (_, i) => 6 + 4.5 * i); // an accelerating flick
  const travel = steps.reduce((a, b) => a + b, 0);
  const arc = drag(23, steps.map(dy => [dy, 16, dy * 45 / travel]));
  check('an arced flick lands in the column it was aimed at',
        arc.dropped && arc.landedX === 4, `dropped=${arc.dropped}, column=${arc.landedX}`);
}

section('Random play stress');
{
  reset();
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

report();
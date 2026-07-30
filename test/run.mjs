// Assertion blocks. The harness stubs the DOM, boots the real modules and
// re-exports them along with the helpers used here.
//
// Every block opens with reset(), which wipes storage, blanks the records and
// re-applies the default theme. Blocks must not inherit state from each other:
// three bugs in this project were masked by assertions that passed only because
// of what a previous block happened to leave behind.

import {
  // harness
  check, section, report, reset, fresh, pumpMs, pumpPastDeath, now, noop, fs,
  els, handlers, docHandlers, store, cssVars, metaThemeColor,
  swatchEls, actionButtons, fakeSwatch, previewCanvas, markCv,
  // board + input helpers
  clearGrid, fillRow, fillFrom, put, filledCells, key,
  tapOverlay, pressAction, dragOnStage, targetMatching, backdropTarget,
  // modules under test
  COLS, ROWS, HIDDEN, LOCK_DELAY, CLEAR_FX, CLEAR_TIME_MAX, DEATH_ROW_MS, DEATH_HOLD_MS,
  ROTATIONS, TYPES, topRow,
  G, state, loadRun, hasSavedRun, board, game,
  THEMES, theme, savedThemeName, applyTheme, view, syncLevelPalette,
  INSET_MARKS, NES_MARKS, Haptics, HAPTIC_CLEAR_PATTERNS,
  updateHud as updateHudFromTest, themeBar,
} from './harness.mjs';

const clock = now();

section('Boot');
{
  reset();
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
  check('touch-action override outranks #app *',
        /#app \.menuBtn, #app \.swatch, #app \.sysBtn \{ touch-action:manipulation/.test(flat));

  // Splash motion has to be opt-out, and must never gate starting a game.
  check('motion respects prefers-reduced-motion',
        /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css) &&
        /\.bgfall\s*\{\s*display:\s*none/.test(css.replace(/\s+/g, ' ')));

  check('worker registration resolves against the module', read('src/main.js').includes("new URL('../sw.js', import.meta.url)"));
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

section('Overlay restart');
{
  reset();
  const tap = {
    pointerId: 3, pointerType: 'touch', button: 0, clientX: 10, clientY: 10, timeStamp: clock,
    target: { closest: () => null }, // tapped the backdrop, not a swatch
    preventDefault: noop,
  };
  for (const fn of handlers.overlay.pointerdown || []) fn(tap);
  check('tapping the overlay restarts', G.state === 'playing', G.state);
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
  G.stats = { marathon: { score: 0, lines: 0, combo: 0 }, zen: { score: 0, lines: 0, combo: 0 } };
  game.startGame();
  pumpMs(20);
  clearGrid();
  clearBottomRow();
  check('no fanfare on the first ever game', G.newBest === false, 'score=' + G.score);
  check('score stays unmarked', !els.score.classes.has('record'));

  // With a real target, it fires exactly when the score passes it.
  G.stats = { marathon: { score: 150, lines: 0, combo: 0 }, zen: { score: 0, lines: 0, combo: 0 } };
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
  check('pause lists the controls', paused.includes('class="controls"'), 'no control list on pause');
  // Two columns per row, so a gesture can never be orphaned from its action.
  const dts = (paused.match(/<dt>/g) || []).length;
  const dds = (paused.match(/<dd>/g) || []).length;
  check('every control is a key/action pair', dts > 0 && dts === dds, `${dts} keys, ${dds} actions`);
  check('the hold gesture is spelled out somewhere reachable',
        /hold/i.test(paused), 'hold gesture not documented in game');

  // Both screens must render the same list from one source. Checked statically
  // rather than by rendering the menu, which would move the state under us.
  const gameSrc = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const uses = (gameSrc.match(/controlsHint\(\)/g) || []).length;
  check('menu and pause share one control list', uses >= 3, `controlsHint used ${uses} times`);
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
  check('both modes appear on the menu',
        (els.overlay.innerHTML.match(/recordCard/g) || []).length === 2,
        String((els.overlay.innerHTML.match(/recordCard/g) || []).length));

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
  check('both runs offered', menu.includes('data-act="continue"') && menu.includes('data-act="continue-zen"'));
  check('each resume shows its own progress', menu.includes('3,210') && menu.includes('42'));
  check('marathon resume carries its score', menu.includes('RESUME GAME') && menu.includes('3,210'));

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

  check('menu offers zen', menu.includes('data-act="zen"'));
  check('prompt names the mode it will resume', menu.includes('TAP TO RESUME ZEN'), 'no mode in prompt');
  check('resume button carries its progress',
        menu.includes('RESUME ZEN &middot; 42 LINES') || menu.includes('RESUME ZEN · 42 LINES'),
        'no progress on button');
  check('zen button reads as starting a new one', menu.includes('NEW ZEN'));
  check('resuming is still the primary action', menu.includes('TAP TO RESUME'));
  // One verb throughout — no CONTINUE anywhere alongside RESUME.
  check('one word for the action, not two', !menu.includes('CONTINUE'), 'mixed CONTINUE and RESUME');

  // "1 LINES" was on screen.
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
  G.stats = { marathon: { score: 8400, lines: 63, combo: 5 }, zen: { score: 0, lines: 0, combo: 0 } };
  game.showMenu();
  const menu = els.overlay.innerHTML;
  check('high score shown', menu.includes('8,400'));
  check('lines shown', menu.includes('63'));
  check('combo shown', menu.includes('5&times;') || menu.includes('5×'));

  // Nothing to boast about before the first game.
  G.stats = { marathon: { score: 0, lines: 0, combo: 0 }, zen: { score: 0, lines: 0, combo: 0 } };
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
  check('menu shows a new-game escape hatch', els.overlay.innerHTML.includes('data-act="new"'));
  check('menu prompt reflects the saved run', els.overlay.innerHTML.includes('TAP TO RESUME'));

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

section('Drop gestures');
{
  reset();
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
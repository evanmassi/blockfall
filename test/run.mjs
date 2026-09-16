import {
  check, section, report, reset, fresh, pumpMs, pumpPastDeath, now, noop, fs, blankStats,
  els, handlers, docHandlers, store, cssVars, metaThemeColor, docStyle,
  swatchEls, actionButtons, debrisCanvases, fakeSwatch, previewCanvas, markCv,
  clearGrid, fillRow, fillFrom, put, filledCells, key,
  tapOverlay, pressAction, dragOnStage, tapUndo, targetMatching, backdropTarget,
  COLS, ROWS, HIDDEN, LOCK_DELAY, CLEAR_FX, CLEAR_TIME_MAX, DEATH_ROW_MS, DEATH_HOLD_MS, READY_MS,
  UNDO_MAX, DEFAULT_SETTINGS, GRAVITY_FRAMES, FRAME_MS,
  ROTATIONS, TYPES, topRow,
  G, state, loadRun, hasSavedRun, board, game, SLOTS, BASES, slotOf, parseSlot,
  THEMES, theme, savedThemeName, applyTheme, view, syncLevelPalette,
  INSET_MARKS, NES_MARKS, Haptics, HAPTIC_CLEAR_PATTERNS,
  updateHud as updateHudFromTest, themeBar,
} from './harness.mjs';

const clock = now();

const VARIANTS_FOR = mode => [slotOf(mode, false), slotOf(mode, true)];

section('Boot');
{
  reset();
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

  check('the board is put away behind the menu', els.app.classes.has('atMenu'));

  check('and starts that way before any script runs',
        /<div id="app" class="[^"]*atMenu/.test(fs.readFileSync('index.html', 'utf8')),
        'the shell paints the board first');

  fresh();
  check('and comes back the moment a game starts', !els.app.classes.has('atMenu'));

  game.togglePause();
  check('and stays out on the pause screen, which is meant to show it',
        !els.app.classes.has('atMenu'));
  game.togglePause();

  check('the modes come before the text links',
        menu.indexOf('data-act="new-marathon"') < menu.indexOf('data-act="how"'),
        `modes at ${menu.indexOf('data-act="new-marathon"')}, links at ${menu.indexOf('data-act="how"')}`);
  check('and each says which clears it will start',
        /data-act="new-marathon">NEW CLASSIC<em>NORMAL<\/em>/.test(menu), 'no clears on the button');
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

  check('every piece is drawn with the real block renderer',
        debrisCanvases.length === 14 && debrisCanvases.every(c => c.ctx.draws === 4),
        debrisCanvases.map(c => c.ctx.draws).join(','));

  check('cell sizes are quantised', pieces.every(p => cell(p) % 2 === 0),
        pieces.map(cell).join(' '));

  const depths = new Set(pieces.map(opacity));
  check('depth varies across it', depths.size > 8, String(depths.size));
  check('and stays inside its range',
        [...depths].every(o => o >= 0.05 && o <= 0.22), [...depths].sort().join(' '));

  const nearest = pieces.reduce((a, b) => (opacity(a) >= opacity(b) ? a : b));
  const furthest = pieces.reduce((a, b) => (opacity(a) <= opacity(b) ? a : b));
  check('the nearest piece is in focus', !nearest.includes('filter:blur'), 'near layer blurred');
  check('the furthest is soft', furthest.includes('filter:blur'), 'far layer sharp');
  check('and near reads bigger than far', cell(nearest) > cell(furthest),
        `${cell(nearest)} vs ${cell(furthest)}`);

  const blurred = pieces.filter(p => p.includes('filter:blur')).length;
  check('only the back of the field carries a filter', blurred >= 7 && blurred <= 11, String(blurred));

  const drift = () => [...els.overlay.innerHTML.replace(/\s+/g, ' ').matchAll(
    /data-type="(\w+)" data-cell="\d+" style="left:([\d.]+)%;[^"]*animation-delay:-([\d.]+)s/g)]
    .map(m => ({ type: m[1], left: m[2], delay: +m[3] }));

  const settled = drift();
  const realNow = Date.now;
  Date.now = () => realNow() + 2000;
  game.openPicker('marathon');
  Date.now = realNow;
  const resumed = drift();

  check('the same field survives a re-render', settled.length === 14 &&
        settled.every((p, i) => resumed[i]?.type === p.type && resumed[i]?.left === p.left),
        `${settled.length} then ${resumed.length}`);
  check('carried on from where it had fallen to',
        settled.every((p, i) => Math.abs((resumed[i].delay - p.delay) - 2) < 0.11),
        settled.map((p, i) => (resumed[i].delay - p.delay).toFixed(1)).join(' '));

  const introCss = fs.readFileSync('style.css', 'utf8').replace(/\s+/g, ' ');
  check('and the mark only drops when the menu is first opened',
        ['mark-floor', 'mark-jolt', 'mark-drop'].every(a =>
          new RegExp(`#overlay\\.intro [^{]*\\{ animation:${a}`).test(introCss)),
        'a title animation runs outside .intro');
  game.showMenu();

  const lefts = pieces.map(p => Number(p.match(/left:([\d.]+)%/)[1]));
  check('pieces are spread across the width',
        Math.min(...lefts) < 10 && Math.max(...lefts) > 88,
        `${Math.min(...lefts).toFixed(1)}..${Math.max(...lefts).toFixed(1)}`);

  game.showMenu();
  check('the field is rebuilt each visit', field() !== first, 'identical arrangement twice');

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
  check('every asset the worker caches exists', missing.length === 0, missing.join(', '));

  const modules = fs.readdirSync(new URL('src/', root)).filter(f => f.endsWith('.js'));
  const unlisted = modules.filter(m => !listed.includes('src/' + m));
  check('every source module is in the asset list', unlisted.length === 0, unlisted.join(', '));

  const manifest = JSON.parse(read('manifest.json'));
  const badIcons = manifest.icons.filter(i => !exists(i.src));
  check('every manifest icon exists', badIcons.length === 0, badIcons.map(i => i.src).join(', '));
  check('manifest has a maskable icon', manifest.icons.some(i => i.purpose === 'maskable'));
  check('installs standalone, not fullscreen', manifest.display === 'standalone', manifest.display);
  check('start_url is relative (works from a subpath)', manifest.start_url.startsWith('./'), manifest.start_url);
  check('scope is relative', manifest.scope.startsWith('./'), manifest.scope);

  const html = read('index.html');
  check('index links the manifest', html.includes('rel="manifest"'));
  check('index links an icon', html.includes('rel="icon"'));

  const css = read('style.css');

  const faceRule = /\n(\[class\*="label"\][^{]*)\{/.exec(css)?.[1].replace(/\s+/g, ' ') ?? '';
  check('every label the screens draw uses the display face',
        ['.recHead', '.recSide', '.setSub', '.wheelTag', '#undoBtn b', '.recordCard.empty']
          .every(sel => faceRule.includes(sel)),
        faceRule || 'no display-face rule');
  check('but the system glyphs are left alone', !faceRule.includes('.sysBtn'),
        'the pixel face has no glyph for these');
  const faces = [...css.matchAll(/url\('([^']+)'\)/g)].map(m => m[1]);
  check('every @font-face file exists', faces.every(f => exists(f)), faces.join(', '));
  check('every font is cached by the worker', faces.every(f => listed.includes(f)), faces.join(', '));
  check('font licence shipped alongside it', exists('fonts/OFL.txt'));

  const sysBtnsRule = /^#sysBtns\s*\{[^}]*\}/m.exec(css)?.[0] ?? '';
  check('corner buttons clear the status bar when installed',
        /top:\s*calc\(env\(safe-area-inset-top\)/.test(sysBtnsRule),
        sysBtnsRule.replace(/\s+/g, ' '));
  const overlayRule = /#overlay\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check('overlay content clears the safe areas',
        /padding:\s*calc\(env\(safe-area-inset-top\)/.test(overlayRule),
        'overlay padding ignores insets');

  const flat = css.replace(/\s+/g, ' ');
  const tapRule = /([^{}]+)\{ touch-action:manipulation/.exec(flat)?.[1] ?? '';
  const commentEnd = tapRule.lastIndexOf('*/');
  const tapSelectors = tapRule.slice(commentEnd < 0 ? 0 : commentEnd + 2).split(',');
  check('touch-action override outranks #app *',
        tapSelectors.length > 1 && tapSelectors.every(s => s.trim().startsWith('#app ')),
        tapSelectors.join(',') || 'no manipulation rule');
  check('and covers the controls added to the board and settings',
        ['#undoBtn', '.setToggle'].every(s => tapSelectors.some(t => t.includes(s))),
        tapSelectors.join(','));

  const appRule = /#app \{([^}]*)\}/.exec(flat)?.[1] ?? '';
  check('the app is sized to the screen, not the viewport',
        /height:var\(--screen-h/.test(appRule), appRule || 'no #app rule');
  check('and not pinned to the viewport by inset',
        !/inset:0/.test(appRule), appRule);

  const rootRule = /html, body \{([^}]*)\}/.exec(flat)?.[1] ?? '';
  check('and so are html and body, which clip what is inside them',
        /height:var\(--screen-h/.test(rootRule), rootRule || 'no html, body rule');
  check('there being no point sizing the layers if their container is short',
        /overflow:hidden/.test(rootRule) && /height:var\(--screen-h/.test(rootRule),
        rootRule);

  check('a too-tall overlay can still be scrolled', /touch-action:\s*pan-y/.test(overlayRule),
        'overlay inherits touch-action:none');
  check('and it is declared after #app *',
        css.indexOf('touch-action:pan-y') > css.indexOf('#app, #app *'),
        'pan-y loses to #app * on source order');

  check('motion respects prefers-reduced-motion',
        /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css) &&
        /\.bgfall\s*\{\s*display:\s*none/.test(css.replace(/\s+/g, ' ')));

  check('worker registration resolves against the module', read('src/main.js').includes("new URL('../sw.js', import.meta.url)"));

  check('revalidation is given time to finish', /e\.waitUntil\(/.test(sw), 'background update is fire-and-forget');
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

  const badPalette = names.filter(n => {
    const unique = new Set(Object.values(THEMES[n].pieces)).size;
    return THEMES[n].sharedPalette ? unique < 2 : unique !== TYPES.length;
  });
  check('piece colours are distinct unless the theme shares a palette',
        badPalette.length === 0, badPalette.join(', '));
  check('NES uses one level triple, not seven colours',
        new Set(Object.values(THEMES.nes.pieces)).size === 3,
        [...new Set(Object.values(THEMES.nes.pieces))].join(' '));

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

  const STYLES = ['bevel', 'inset', 'nes'];
  const badStyle = names.filter(n => !STYLES.includes(THEMES[n].block.style));
  check('every theme declares a known block style', badStyle.length === 0, badStyle.join(', '));
  check('the hardware themes do not use the bevel',
        THEMES.gameboy.block.style === 'inset' && THEMES.nes.block.style === 'nes');
  check('Game Boy has no glow', THEMES.gameboy.block.glow === 0);

  const marks = TYPES.map(t => INSET_MARKS[t]);
  check('every piece has a Game Boy fill mark', marks.every(Boolean), JSON.stringify(INSET_MARKS));
  check('no two pieces share a fill mark', new Set(marks).size === TYPES.length, marks.join(','));

  const nes = TYPES.map(t => NES_MARKS[t]);
  check('every piece has an NES tile', nes.every(Boolean), JSON.stringify(NES_MARKS));
  check('both NES tile designs are used', new Set(nes).size === 2, nes.join(','));

  const pale = TYPES.filter(t => lum(THEMES.nes.pieces[t]) > 190);
  check('pale NES pieces use the ring tile', pale.every(t => NES_MARKS[t] === 'ring'),
        pale.map(t => `${t}=${NES_MARKS[t]}`).join(', '));

  applyTheme('aurora');
  check('applyTheme switches the live theme', theme.key === 'aurora', theme.key);
  check('CSS vars follow', cssVars['--accent'] === THEMES.aurora.accent, cssVars['--accent']);
  check('scanlines var follows', cssVars['--scanlines'] === 'none', cssVars['--scanlines']);
  check('soft overlay var follows', cssVars['--overlay-soft'] === THEMES.aurora.overlaySoft, cssVars['--overlay-soft']);
  check('status bar color follows', metaThemeColor.content === THEMES.aurora.bg, metaThemeColor.content);

  applyTheme('nes');
  fresh();
  check('playing, the chrome is the board colour',
        metaThemeColor.content === THEMES.nes.bg, metaThemeColor.content);

  game.showMenu();
  check('under a menu it is the overlay it will be painted with',
        metaThemeColor.content === '#000000', metaThemeColor.content);
  check('which is nothing like the raw theme colour',
        metaThemeColor.content !== THEMES.nes.bg, 'chrome still mismatches the page');
  check('and the page carries the same colour',
        docStyle.background === '#000000', String(docStyle.background));

  check('the colour is kept for the next launch',
        store['blockfall.paint'] === '#000000', String(store['blockfall.paint']));
  const head = fs.readFileSync('index.html', 'utf8').split('</head>')[0];
  check('and index restores it before first paint',
        head.includes("localStorage.getItem('blockfall.paint')"), 'no inline restore in <head>');
  check('onto the body, which is the surface that paints the band',
        /html\s*,\s*body\s*\{\s*background:/.test(head), 'the restore misses body');
  check('inline rather than fetched, which would land too late',
        !/<script[^>]*\ssrc=/.test(head), 'the restore is an external script');

  const settles = () => {
    const [, r, g, b, a] = /rgba?\(\s*([\d.]+)\D+([\d.]+)\D+([\d.]+)\s*,\s*([\d.]+)/.exec(theme.overlay);
    const X = [1, 3, 5].map(i => parseInt(docStyle.background.slice(i, i + 2), 16));
    return [+r, +g, +b].every((o, i) => Math.round(o * +a + X[i] * (1 - +a)) === X[i]);
  };
  check('so the overlay over the page leaves the page unchanged', settles(), docStyle.background);

  for (const name of Object.keys(THEMES)) {
    applyTheme(name);
    check(`  and for ${name}`, settles(), `${name} ${docStyle.background} vs ${theme.overlay}`);
  }

  applyTheme('neon');
  game.showMenu();
  const wasNeon = docStyle.background;
  applyTheme('gameboy');
  check('switching theme under a menu repaints the page',
        docStyle.background !== wasNeon, `stuck at ${docStyle.background}`);

  applyTheme('nes');
  fresh();
  check('back to the board colour once play resumes',
        metaThemeColor.content === THEMES.nes.bg, metaThemeColor.content);
  game.togglePause();
  check('and the see-through pause screen gets its own',
        metaThemeColor.content === '#000000', metaThemeColor.content);
  game.togglePause();
  applyTheme('aurora');
  check('choice persisted', store['blockfall.theme'] === 'aurora', store['blockfall.theme']);
  check('savedThemeName reads it back', savedThemeName() === 'aurora');

  store['blockfall.theme'] = 'not-a-theme';
  check('unknown saved theme falls back to neon', savedThemeName() === 'neon');

  const bar = themeBar();
  check('theme bar marks the active swatch', bar.includes('data-theme="aurora"') && bar.includes('swatch on'));
  check('theme bar lists every theme', names.every(n => bar.includes(`data-theme="${n}"`)));
  check('swatches render a canvas, not colour chips', bar.includes('swatchCv') && !bar.includes('chips'));

  swatchEls.length = 0;
  for (const n of names) swatchEls.push(fakeSwatch(n));
  const swatchTarget = { closest: sel => sel === '[data-theme]' ? { dataset: { theme: 'forest' } } : null };
  const before = G.state;
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
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('clears 1 line', G.lines === 1, 'lines=' + G.lines);
  check('awards 100 + drop pts', G.score - before >= 100, 'delta=' + (G.score - before));
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
  fillRow(ROWS - 1, 4);
  G.grid[ROWS - 3][3] = 'I';
  put('T', 3, ROWS - 3, 0);
  game.rotate(1);
  game.rotate(1);
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
  G.grid[ROWS - 4][0] = 'I';
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
  game.lockPiece();
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
    target: { closest: () => null },
    preventDefault: noop,
  };
  for (const fn of handlers.overlay.pointerdown || []) fn(tap);
  check('tapping the menu backdrop does nothing', G.state === 'menu', G.state);

  pressAction('new-marathon');
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

  G.stats = { ...blankStats(), marathon: { score: 0, lines: 0, combo: 0 } };
  game.startGame();
  pumpMs(20);
  clearGrid();
  clearBottomRow();
  check('no fanfare on the first ever game', G.newBest === false, 'score=' + G.score);
  check('score stays unmarked', !els.score.classes.has('record'));

  G.stats = { ...blankStats(), marathon: { score: 150, lines: 0, combo: 0 } };
  game.startGame();
  pumpMs(20);
  clearGrid();
  check('target captured at the start of the run', G.runBest === 150, String(G.runBest));

  clearBottomRow();
  check('silent below the target', G.newBest === false, 'score=' + G.score);
  check('score unmarked below the target', !els.score.classes.has('record'));

  clearBottomRow();
  check('fires once past the target', G.newBest === true, 'score=' + G.score);
  check('score element lit for the rest of the run', els.score.classes.has('record'));

  game.gameOver();
  pumpMs(DEATH_ROW_MS * 25 + DEATH_HOLD_MS + 150);
  check('game over celebrates the record', els.overlay.innerHTML.includes('NEW HIGH SCORE!'));
  check('record persisted as the new best', G.stats.marathon.score === G.score,
        `${G.stats.marathon.score} vs ${G.score}`);

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

  tapOverlay(backdropTarget);
  check('a stray tap does not resume out from under it', G.state === 'paused', G.state);

  pressAction('back');
  check('back returns to pause, still paused',
        G.state === 'paused' && els.overlay.innerHTML.includes('PAUSED'), G.state);
  check('and the modal guard is lifted', !els.overlay.classes.has('modal'));

  const gameSrc = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const uses = (gameSrc.match(/controlsHint\(\)/g) || []).length;
  check('one control list, reached from both screens', uses === 2, `controlsHint appears ${uses} times`);
}

section('Overlay taps');
{
  reset();
  check('no overlay behaviour depends on click', !(handlers.overlay.click || []).length);

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
  // PITFALL: no ghost mouse event on purpose; the button's own preventDefault suppresses it at source.
  check('main menu goes to the menu, not back into the game', G.state === 'menu', G.state);
  check('menu clears the abandoned board', G.grid.every(r => r.every(c => !c)));
}

section('Restart and abandoned runs');
{
  reset();
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

  check('zen levels off', game.levelFor(2000) === game.levelFor(50),
        `${game.levelFor(2000)} vs ${game.levelFor(50)}`);
  const zenTop = game.levelFor(2000);
  G.mode = 'marathon';
  check('marathon keeps climbing', game.levelFor(2000) > zenTop,
        `${game.levelFor(2000)} vs ${zenTop}`);
  G.mode = 'zen';

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
  check('one button stands for every saved run', menu.includes('data-act="pick-resume"'));
  check('saying how many are waiting', menu.includes('2 RUNS WAITING'), 'no count on the button');
  check('and none of them is on the menu until it is opened',
        !menu.includes('data-act="go-'), 'the runs are laid out flat');

  game.openPicker();
  const picked = els.overlay.innerHTML;
  check('opening it lists them', picked.includes('data-act="go-marathon"') &&
        picked.includes('data-act="go-zen"'));
  check('each naming its clears and its progress',
        /data-act="go-marathon">\s*<span>CLASSIC · NORMAL<\/span>\s*<em>3,210<\/em>/.test(picked),
        'a row lost its detail');
  check('over the button rather than beside it',
        picked.indexOf('class="picker"') < picked.indexOf('data-act="pick-resume"'),
        'the list opened below the button');

  check('and it is the only thing asking to be looked at',
        els.overlay.classes.has('picking') && !picked.includes('class="menuBtn on"'),
        'something else is still lit');
  game.openPicker();
  check('which stands down again once it closes', !els.overlay.classes.has('picking'));

  check('most recent mode is what a plain tap resumes', game.pendingRun() === 'marathon', game.pendingRun());
  game.resumeRun('zen');
  check('resuming zen explicitly works', G.mode === 'zen' && G.lines === 42, `${G.mode}/${G.lines}`);
  game.showMenu();
  check('and becomes the pending one', game.pendingRun() === 'zen', game.pendingRun());
}

section('A saved zen run comes back as zen');
{
  reset();
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
  check('one run waiting is named on the button',
        /data-act="pick-resume">RESUME<em>ZEN NORMAL<\/em>/.test(menu), 'no run named');
  check('start buttons say what they do', /data-act="new-zen">NEW ZEN</.test(menu), 'start button lost its verb');
  check('both modes are offered', ['new-marathon', 'new-zen'].every(a => menu.includes(`data-act="${a}"`)));

  check('the menu never asks which clears',
        !menu.includes('data-act="play-'), 'the clears are still picked at the door');

  for (const slot of SLOTS) { fresh(slot); G.score = 3210; G.lines = 42; game.showMenu(); }
  const full = els.overlay.innerHTML;
  const buttons = (full.match(/class="menuBtn[ "]/g) || []).length;
  check('four saved runs still cost three buttons', buttons === 3, String(buttons));
  check('the third of them standing for all four',
        /data-act="pick-resume">RESUME<em>4 RUNS WAITING<\/em>/.test(full), 'no count on the button');

  check('the groups are split by rules', (full.match(/class="menuRule"/g) || []).length === 3,
        String((full.match(/class="menuRule"/g) || []).length));

  game.openPicker();
  const listed = els.overlay.innerHTML;
  check('and the list holds one row per run',
        (listed.match(/class="pickRow"/g) || []).length === 4,
        String((listed.match(/class="pickRow"/g) || []).length));
  check('one per slot, none doubled up',
        SLOTS.every(slot => (listed.match(new RegExp(`data-act="go-${slot}"`, 'g')) || []).length === 1),
        'a slot is missing or listed twice');
  game.showMenu();

  check('with a way to start over beside it', menu.includes('data-act="new-marathon"'));
  check('one word for the action, not two', !menu.includes('CONTINUE'), 'mixed CONTINUE and RESUME');
  check('the other mode is named too', menu.includes('CLASSIC') && !menu.includes('GAME'), 'a mode is still called GAME');

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
  store['blockfall.run'] = JSON.stringify({
    v: 1, mode: 'zen', lines: 7, score: 10, grid: '.'.repeat(ROWS * COLS),
  });
  state.migrateLegacyRun();
  check('a legacy save is rehomed to its mode', hasSavedRun('zen'));
  check('and the old key is cleared', !('blockfall.run' in store));

  reset();
  store['blockfall.run.cascade'] = JSON.stringify({
    v: 1, mode: 'cascade', score: 18400, grid: '.'.repeat(ROWS * COLS),
  });
  state.migrateLegacyRun();
  check('a cascade run survives the split', hasSavedRun('marathon-cascade'));
  check('carrying its score', loadRun('marathon-cascade').score === 18400,
        String(loadRun('marathon-cascade').score));
  check('and the mode-era key is gone', !('blockfall.run.cascade' in store));

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

  reset();
  fresh('marathon-cascade');
  G.score = 500;
  game.snapshotRun();
  check('the save records which clears it was played with',
        loadRun('marathon-cascade').cascade === true,
        JSON.stringify(loadRun('marathon-cascade').cascade));

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

  G.score = 0;
  game.startGame();
  pumpMs(20);
  G.score = 1200;
  pumpMs(17);
  const midway = shown();
  check('a big gain counts up rather than snapping', midway > 0 && midway < 1200, String(midway));
  pumpMs(1200);
  check('and arrives at the real score', shown() === 1200, String(shown()));

  G.score = 1201;
  pumpMs(17);
  check('small gains land immediately', shown() === 1201, String(shown()));

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

  check('progression continues past level 14', at(20) < at(14), `${Math.round(at(14))}ms -> ${Math.round(at(20))}ms`);
  check('and past level 20', at(30) < at(20), `${Math.round(at(20))}ms -> ${Math.round(at(30))}ms`);

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

  let threw = false;
  try {
    Haptics.lock(); Haptics.drop(); Haptics.hold();
    Haptics.clear(4); Haptics.tspin(); Haptics.levelUp(); Haptics.record(); Haptics.over();
  } catch { threw = true; }
  check('calls are inert where vibration is unavailable', !threw);

  const src = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const moveBody = src.slice(src.indexOf('export function move('), src.indexOf('export function rotate('));
  check('no haptics on move or rotate', !moveBody.includes('Haptics.'));

  game.startGame();
  pumpMs(20);
  game.togglePause();
  check('no buzz toggle where vibration is unsupported',
        !els.overlay.innerHTML.includes('data-act="haptics"'));

  Haptics.supported = true;
  game.showPauseScreen();
  check('buzz toggle offered where it is supported', els.overlay.innerHTML.includes('data-act="haptics"'));
  check('toggle label reflects the current state', els.overlay.innerHTML.includes('BUZZ ON'));

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

  game.showMenu();
  check('menu still offers the run', hasSavedRun('marathon'));
  check('menu shows a new-game escape hatch', els.overlay.innerHTML.includes('data-act="new-marathon"'));
  check('menu offers the run as a button', els.overlay.innerHTML.includes('data-act="pick-resume"'));

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

  game.gameOver();
  pumpMs(DEATH_ROW_MS * 25 + DEATH_HOLD_MS + 150);
  check('game over clears the saved run', !hasSavedRun('marathon'));

  game.startGame();
  pumpMs(20);
  game.snapshotRun();
  check('a fresh run saves again', hasSavedRun('marathon'));
  game.startGame();
  pumpMs(20);
  check('starting a new game replaces its own slot',
        JSON.parse(store['blockfall.run.marathon']).score === 0,
        String(JSON.parse(store['blockfall.run.marathon']).score));

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
  check('cascade starts off', G.settings.cascade === false);
  check('undos start off', G.settings.undos === 0, String(G.settings.undos));
  check('zen keeps the ceiling it always had', G.settings.zenMax === DEFAULT_SETTINGS.zenMax,
        String(G.settings.zenMax));
  check('and opens at the bottom', G.settings.zenMin === 1, String(G.settings.zenMin));

  pressAction('settings');
  check('the menu opens them', els.overlay.innerHTML.includes('SETTINGS'));
  check('modal, so a stray tap cannot start a game behind it', els.overlay.classes.has('modal'));

  check('undos are a wheel', /data-wheel="undos"/.test(els.overlay.innerHTML), 'no undo wheel');

  const rows = els.overlay.innerHTML.replace(/\s+/g, ' ').match(/<div class="setRow">.*?<div class="setCtl">/g) || [];
  check('every row reads name, meaning, then control', rows.length === 4, String(rows.length));
  check('in that order, whatever the control is',
        rows.every(r => r.indexOf('class="label"') < r.indexOf('class="setSub"')),
        'a row puts its meaning before its name');

  const rowCss = /--rowH:\s*(\d+)px/.exec(fs.readFileSync('style.css', 'utf8'))?.[1];
  const rowJs = /const WHEEL_ROW = (\d+)/.exec(fs.readFileSync('src/ui.js', 'utf8'))?.[1];
  check('its row height agrees with the stylesheet', rowCss && rowCss === rowJs,
        `css ${rowCss} vs js ${rowJs}`);
  check('and it is scrolled to the value it is showing',
        /data-at="0"/.test(els.overlay.innerHTML), 'the wheel opens at the top rather than at its value');

  check('the wheel can be turned by a finger',
        /#app \.wheelScroll \{[^}]*touch-action:pan-y/.test(
          fs.readFileSync('style.css', 'utf8').replace(/\s+/g, ' ')),
        'touch-action loses to #app *');
  check('with every value on it, off included',
        [0, 1, 2, 3, 4, 5].every(v => els.overlay.innerHTML.includes(`data-act="set-undos-${v}"`)),
        'a value is unreachable');

  const wheelHtml = /data-wheel="undos"[\s\S]*?<\/div>/.exec(els.overlay.innerHTML)?.[0];
  pressAction('set-undos-1');
  check('picking one sets it', G.settings.undos === 1, String(G.settings.undos));
  check('without the wheel being rebuilt under the finger',
        /data-wheel="undos"[\s\S]*?<\/div>/.exec(els.overlay.innerHTML)?.[0] === wheelHtml,
        'the wheel was redrawn by its own value');
  check('and the screen redraws to say what that means',
        els.overlay.innerHTML.includes('1 TAKE-BACK EACH GAME'), 'says 1 TAKE-BACKS');
  pressAction('set-undos-2');
  check('counted properly past one', els.overlay.innerHTML.includes('2 TAKE-BACKS EACH GAME'));
  pressAction('set-undos-0');
  check('and off reads as off, not as zero', els.overlay.innerHTML.includes('NO TAKE-BACKS'));
  check('the chosen one is marked on the wheel',
        /data-act="set-undos-0">OFF/.test(els.overlay.innerHTML.replace(/\s+/g, ' ')) &&
        /class="wheelItem on"[^>]*data-act="set-undos-0"/.test(els.overlay.innerHTML.replace(/\s+/g, ' ')),
        'nothing marked as current');

  pressAction('countdown');
  check('the countdown toggles', G.settings.countdown === true);
  check('and says what it will do', els.overlay.innerHTML.includes('3-2-1 BEFORE PLAY RESUMES'));
  pressAction('countdown');
  check('and back again', G.settings.countdown === false);

  pressAction('cascade');
  check('cascade toggles', G.settings.cascade === true);
  check('saying what it does rather than naming itself twice',
        els.overlay.innerHTML.includes('CLEARS DROP INTO THE HOLES'));
  pressAction('cascade');
  check('and back', G.settings.cascade === false);

  check('zen speed is two wheels', /data-wheel="zenMin"/.test(els.overlay.innerHTML) &&
        /data-wheel="zenMax"/.test(els.overlay.innerHTML), 'not a range');
  check('and the ceiling can be taken off entirely',
        els.overlay.innerHTML.includes('data-act="set-zenMax-0"'), 'no uncapped option');

  pressAction('set-zenMin-4');
  check('the floor moves', G.settings.zenMin === 4, String(G.settings.zenMin));
  check('reading as a span she can picture',
        /GENTLE|STEADY|BRISK|RELENTLESS/.test(els.overlay.innerHTML) &&
        els.overlay.innerHTML.includes('TO THE FLOOR'), 'no speed in words');

  pressAction('set-zenMin-9');
  check('a floor pushed past the ceiling takes it along',
        G.settings.zenMin === 9 && G.settings.zenMax === 9,
        `${G.settings.zenMin}/${G.settings.zenMax}`);
  pressAction('set-zenMax-3');
  check('and a ceiling pulled under the floor drags it down',
        G.settings.zenMin === 3 && G.settings.zenMax === 3,
        `${G.settings.zenMin}/${G.settings.zenMax}`);
  pressAction('set-zenMax-0');
  check('uncapped leaves the floor where it is',
        G.settings.zenMin === 3 && G.settings.zenMax === 0,
        `${G.settings.zenMin}/${G.settings.zenMax}`);

  const cancels = fs.readFileSync('src/ui.js', 'utf8');
  check('a wheel thrown away takes its pending value with it',
        cancels.includes('stopWheels()') && /isConnected === false/.test(cancels),
        'a settle can outlive its wheel');
  check('and the rebuild is what cancels them',
        cancels.includes('  stopWheels();' + '\n' + '  overlay.innerHTML = html'),
        'the markup is replaced before the timers are cleared');
  pressAction('set-zenMin-1');
  pressAction('set-zenMax-5');

  pressAction('set-undos-1');
  check('saved as they change', JSON.parse(store['blockfall.settings']).undos === 1,
        store['blockfall.settings']);
  check('and read back on the next launch', state.loadSettings().undos === 1);

  store['blockfall.settings'] = JSON.stringify({ undos: 99, zenMax: 40, zenMin: 88, countdown: 1 });
  const clamped = state.loadSettings();
  check('a hand-edited store is clamped rather than trusted',
        clamped.undos === UNDO_MAX && clamped.zenMax === DEFAULT_SETTINGS.zenMax &&
        clamped.zenMin === DEFAULT_SETTINGS.zenMin && clamped.countdown === true,
        JSON.stringify(clamped));

  store['blockfall.settings'] = JSON.stringify({ zenCap: 8 });
  check('a store from before the floor keeps its ceiling',
        state.loadSettings().zenMax === 8, JSON.stringify(state.loadSettings()));

  check('the settings heading carries the debug toggle',
        /<h2 data-debug>SETTINGS<\/h2>/.test(els.overlay.innerHTML), 'no toggle target');
  const shell = fs.readFileSync('src/main.js', 'utf8');
  check('and nothing else in the app does',
        (shell.match(/\[data-debug\]/g) || []).length === 1 &&
        !shell.includes(".closest?.('.markWrap')"),
        'the toggle is still on the wordmark');

  pressAction('back');
  check('BACK returns to the menu it came from', els.overlay.innerHTML.includes('data-act="new-marathon"'));

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
  check('the ceiling holds the level down',
        game.levelFor(2000) === DEFAULT_SETTINGS.zenMax, String(game.levelFor(2000)));

  G.settings.zenMin = 4;
  check('and the floor holds it up', game.levelFor(0) === 4, String(game.levelFor(0)));
  check('with the ceiling still on top', game.levelFor(2000) === DEFAULT_SETTINGS.zenMax,
        String(game.levelFor(2000)));

  fresh('zen');
  check('a new zen run opens at the floor', G.level === 4, String(G.level));
  check('and falls at that speed from the first piece',
        game.gravityInterval() === GRAVITY_FRAMES[3] * FRAME_MS, String(game.gravityInterval()));

  G.settings.zenMin = 1;
  G.mode = 'marathon';
  check('neither touches the other mode', game.levelFor(2000) === 201, String(game.levelFor(2000)));

  G.mode = 'zen';
  G.settings.zenMax = 0;
  check('uncapped, zen climbs like classic does', game.levelFor(2000) === 201,
        String(game.levelFor(2000)));
  G.settings.zenMax = DEFAULT_SETTINGS.zenMax;

  reset();
  pressAction('settings');
  pressAction('set-zenMax-0');
  check('the ceiling can come off', G.settings.zenMax === 0, String(G.settings.zenMax));
  check('where it says so in words', els.overlay.innerHTML.includes('KEEPS SPEEDING UP'));
  pressAction('set-zenMax-10');
  check('and go back on at the fastest', G.settings.zenMax === 10, String(G.settings.zenMax));
  check('read as a span she can picture, not two level numbers',
        /GENTLE 16s → RELENTLESS 2s TO THE FLOOR/.test(els.overlay.innerHTML),
        els.overlay.innerHTML.match(/class="setSub">[^<]*/g)?.join(' | ') || 'no sub line');
  pressAction('set-zenMax-1');
  check('down to the slowest, which drags the floor with it',
        G.settings.zenMax === 1 && G.settings.zenMin === 1,
        `${G.settings.zenMin}/${G.settings.zenMax}`);
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

  reset();
  G.settings.undos = 2;
  fresh();
  G.score = 500;
  fillRow(ROWS - 1, 5);
  game.spawn();
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

  G.settings.undos = 4;
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  tapUndo();
  check('a charge spent leaves the rest', G.undosUsed === 1 && els.undoLeft.textContent === '3',
        `${G.undosUsed}/${els.undoLeft.textContent}`);

  reset();
  G.settings.undos = UNDO_MAX;
  fresh();
  for (let i = 0; i < 12; i++) { game.hardDrop(); pumpMs(CLEAR_TIME_MAX + 60); clearGrid(); }
  check('only as much history as the charges can reach',
        G.undoStack.length <= UNDO_MAX + 1, String(G.undoStack.length));

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

  reset();
  fresh();
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  game.togglePause();
  pressAction('settings');
  pressAction('set-undos-1');
  pressAction('back');
  game.togglePause();
  check('the button arrives without restarting', els.undoBtn.hidden === false);
  check('but there is no history to undo into yet', els.undoBtn.disabled === true);

  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 60);
  check('and it comes alive on the next piece', els.undoBtn.disabled === false);

  reset();
  G.settings.undos = 3;
  fresh();
  for (let i = 0; i < 3; i++) { game.hardDrop(); pumpMs(CLEAR_TIME_MAX + 60); clearGrid(); }
  game.togglePause();
  pressAction('settings');
  pressAction('set-undos-0');
  check('switching undos off drops the history with them', G.undoStack.length === 0,
        String(G.undoStack.length));
  pressAction('set-undos-3');
  check('and switching back on starts again from here', G.undoStack.length === 1,
        String(G.undoStack.length));
}

section('Starting another game is a button, not a hint');
{
  reset();
  // PITFALL: reset() itself snapshots the run left going by the last block, so the store is wiped again.
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

  pressAction('restart');
  check('play again stays in the mode you died in', G.mode === 'zen', G.mode);
  check('and with the clears it was played with', G.cascade === false, String(G.cascade));
  check('and starts from scratch', G.score === 0 && G.lines === 0, `${G.score}/${G.lines}`);
}

section('Cascade gravity');
{
  reset();

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

  clearGrid();
  G.grid[ROWS - 6][0] = 'T';
  G.grid[ROWS - 4][0] = 'S';
  G.grid[ROWS - 2][0] = 'Z';
  board.settle(G.grid);
  check('a column compacts completely',
        G.grid.map(r => r[0] || '.').join('').endsWith('TSZ'),
        G.grid.map(r => r[0] || '.').join(''));

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

  clearGrid();
  fillRow(ROWS - 1, 0);
  fillRow(ROWS - 2, 0);
  G.grid[ROWS - 2][0] = null;
  put('I', -2, ROWS - 4, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 80);

  check('the first clear lands', G.lines >= 1, String(G.lines));
  check('chain reset once it settles', G.chain === 0, String(G.chain));

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

  reset();
  fresh('marathon-cascade');
  clearGrid();
  for (let y = ROWS - 4; y < ROWS; y++) fillRow(y, 0);
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX * 5 + 400);
  check('one placement is one combo step', G.combo <= 0, String(G.combo));

  reset();
  fresh('marathon');
  clearGrid();
  fillRow(ROWS - 1, 0);
  G.grid[ROWS - 3][5] = 'T';
  put('I', -2, ROWS - 4, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 80);
  check('classic leaves overhangs where they are', G.grid[ROWS - 2][5] === 'T',
        G.grid.map(r => r[5] || '.').join(''));

  reset();
  fresh('marathon-cascade');
  clearGrid();
  fillRow(ROWS - 1, 0);
  G.grid[ROWS - 4][5] = 'T';
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
  check('the grid is settled while they are still falling', G.grid[ROWS - 1][5] === 'T',
        G.grid[ROWS - 1].map(c => c || '.').join(''));

  game.togglePause();
  check('pausing mid-fall has its own state', G.state === 'pausedSettling', G.state);
  pumpMs(600);
  check('and the fall is frozen', G.state === 'pausedSettling', G.state);
  game.togglePause();
  check('resuming returns to the fall', G.state === 'settling', G.state);

  pumpMs(READY_MS + 600);
  check('which finishes on its own', G.falling === null && G.state === 'playing', G.state);

  reset();
  fresh('marathon');
  clearGrid();
  fillRow(ROWS - 1, 0);
  G.grid[ROWS - 4][5] = 'T';
  put('I', -2, 0, 1);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 200);
  check('classic never settles', G.falling === null && G.state === 'playing', G.state);

  reset();
  fresh('marathon-cascade');
  G.score = 12000;
  G.lines = 40;
  game.showMenu();
  check('cascade keeps its own record',
        G.stats['marathon-cascade'].score === 12000, String(G.stats['marathon-cascade'].score));
  check('and leaves classic alone', G.stats.marathon.score === 0, String(G.stats.marathon.score));
  check('with its own saved run', hasSavedRun('marathon-cascade'));
  game.openPicker();
  check('offered in the list of runs waiting',
        els.overlay.innerHTML.includes('data-act="go-marathon-cascade"'));
  game.openPicker();

  game.resumeRun('marathon-cascade');
  check('and it resumes with cascade clears',
        G.mode === 'marathon' && G.cascade === true && G.score === 12000,
        `${G.mode}/${G.cascade}/${G.score}`);
}

section('Cascade on either mode');
{
  reset();
  fresh('zen-cascade');
  check('zen can be played with cascade clears',
        G.mode === 'zen' && G.cascade === true, `${G.mode}/${G.cascade}`);

  clearGrid();
  fillFrom(HIDDEN, 'T');
  put('T', 4, 0, 0);
  game.hardDrop();
  pumpMs(CLEAR_TIME_MAX + 400);
  check('and still rescues instead of dying', G.state !== 'dying' && G.state !== 'over', G.state);

  check('with nothing left floating', G.falling === null, JSON.stringify(G.falling));

  G.level = 20;
  const zenCascade = game.gravityInterval();
  G.cascade = false;
  check('the zen speed cap applies whichever clears are on',
        game.gravityInterval() === zenCascade, String(zenCascade));

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

  const blip = drag(20, Array.from({ length: 12 }, (_, i) => (i === 6 ? [14, 8] : [5, 26])));
  check('slow drag with a speed blip does not hard drop', !blip.dropped);
  check('slow drag still soft drops', G.active.y > 4, 'y=' + G.active.y);

  const flick = drag(21, Array.from({ length: 5 }, () => [22, 8]));
  check('a deliberate flick still hard drops', flick.dropped);
  pumpMs(CLEAR_TIME_MAX + 60);

  const twitch = drag(22, [[20, 8], [18, 8]]);
  check('a short fast twitch does not hard drop', !twitch.dropped);

  const steps = Array.from({ length: 9 }, (_, i) => 6 + 4.5 * i);
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

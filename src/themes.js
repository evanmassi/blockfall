// Every colour decision in the game. Adding a theme is one entry here.
//
//   flash         "r,g,b" for the clear wash; must read against `well`, so it
//                 is not always white
//   block.style   how a cell is constructed, not just tinted. Only 'bevel'
//                 leaves a gap between cells; the hardware styles butt together
//                 so their outlines form the grid.
//   block.shade   'bevel' only
//   sharedPalette colours deliberately repeat across pieces
export const THEMES = {
  neon: {
    name: 'Neon',
    bg: '#07060f', panel: '#0f0d1f', edge: '#241f42',
    text: '#e8e6ff', dim: '#7b74a8', accent: '#ff2d95',
    well: '#0a0819', gridLine: 'rgba(120,100,220,.09)',
    overlay: 'rgba(7,6,15,.9)', overlaySoft: 'rgba(7,6,15,.52)',
    boardShadow: '0 0 0 1px var(--edge), 0 0 46px -8px var(--accent)',
    flash: '255,255,255',
    scanlines: true,
    block: { style: 'bevel', glow: 1, light: 0.5, shade: 0.42, outline: 'rgba(255,255,255,.28)' },
    pieces: { I:'#22e8ff', J:'#4d6bff', L:'#ff9d24', O:'#ffe14d', S:'#3dff96', T:'#c14dff', Z:'#ff2f68' },
  },

  aurora: {
    name: 'Aurora',
    bg: '#04101a', panel: '#0a1c2b', edge: '#17384a',
    text: '#dff4ff', dim: '#6d94a8', accent: '#4fe3c1',
    well: '#061520', gridLine: 'rgba(80,180,200,.09)',
    overlay: 'rgba(4,16,26,.9)', overlaySoft: 'rgba(4,16,26,.52)',
    boardShadow: '0 0 0 1px var(--edge), 0 0 52px -10px var(--accent)',
    flash: '224,255,248',
    scanlines: false,
    block: { style: 'bevel', glow: 0.85, light: 0.46, shade: 0.4, outline: 'rgba(255,255,255,.24)' },
    pieces: { I:'#5ce1e6', J:'#4a7fd4', L:'#ffb26b', O:'#ffe9a3', S:'#7ef0a8', T:'#a98cf0', Z:'#f0788f' },
  },

  forest: {
    name: 'Forest',
    bg: '#14180f', panel: '#1e2417', edge: '#3a4327',
    text: '#eef0e2', dim: '#8d9678', accent: '#d98a3d',
    well: '#191e12', gridLine: 'rgba(150,170,110,.09)',
    overlay: 'rgba(20,24,15,.92)', overlaySoft: 'rgba(20,24,15,.55)',
    boardShadow: '0 0 0 1px var(--edge), 0 4px 30px -12px rgba(217,138,61,.8)',
    flash: '248,242,214',
    scanlines: false,
    block: { style: 'bevel', glow: 0.3, light: 0.4, shade: 0.38, outline: 'rgba(255,255,255,.18)' },
    pieces: { I:'#63c2c9', J:'#4e6fa8', L:'#d98a3d', O:'#e8c65c', S:'#7fae4b', T:'#a2739f', Z:'#c1583f' },
  },

  // --- hardware recreations; the picker breaks to a second row here ---

  // The hardware assigned colours per *level*, not per piece: three at a time,
  // reused across the seven tetrominoes. These are the level-0 three, so pieces
  // repeat colours and are told apart by shape and tile, as they were.
  nes: {
    name: 'NES',
    bg: '#1c1c1c', panel: '#2c2c2c', edge: '#bcbcbc',
    text: '#fcfcfc', dim: '#9c9c9c', accent: '#3cbcfc',
    well: '#000000', gridLine: 'rgba(255,255,255,.04)',
    overlay: 'rgba(0,0,0,.9)', overlaySoft: 'rgba(0,0,0,.55)',
    boardShadow: '0 0 0 2px #bcbcbc, 0 0 0 7px #000000',
    flash: '252,252,252',
    scanlines: true,
    sharedPalette: true, // colours repeat across pieces, as on the console
    block: { style: 'nes', glow: 0.22, light: 0.55, shade: 0.3, outline: 'rgba(0,0,0,.5)' },
    pieces: {
      I: '#3cbcfc', S: '#3cbcfc', L: '#3cbcfc', // slot 0
      J: '#0058f8', Z: '#0058f8',               // slot 1
      O: '#fcfcfc', T: '#fcfcfc',               // slot 2, drawn as rings
    },

    // Fixed; only the colours in the slots change as you climb.
    paletteSlots: { I: 0, S: 0, L: 0, J: 1, Z: 1, O: 2, T: 2 },

    // [slot0, slot1, slot2] per level, cycling every ten. The colours are
    // genuine NES; the order is my arrangement, not the console's exact table.
    levelPalettes: [
      ['#3cbcfc', '#0058f8', '#fcfcfc'], // 1  cyan / blue
      ['#58d854', '#00a800', '#fcfcfc'], // 2  green
      ['#f878f8', '#d800cc', '#fcfcfc'], // 3  pink / magenta
      ['#58d854', '#0058f8', '#fcfcfc'], // 4  green / blue
      ['#58f898', '#e40058', '#fcfcfc'], // 5  mint / crimson
      ['#6888fc', '#58d854', '#fcfcfc'], // 6  periwinkle / green
      ['#bcbcbc', '#f83800', '#fcfcfc'], // 7  grey / red
      ['#a80020', '#6844fc', '#fcfcfc'], // 8  dark red / violet
      ['#f83800', '#0058f8', '#fcfcfc'], // 9  red / blue
      ['#fca044', '#f83800', '#fcfcfc'], // 10 orange / red
    ],
  },

  // The DMG drew every piece in one colour and told them apart by fill pattern.
  // These step down a single olive ramp instead: monochrome, still separable.
  gameboy: {
    name: 'Game Boy',
    bg: '#37392f', panel: '#464a3c', edge: '#6b7052',
    text: '#c6cfa2', dim: '#8b9470', accent: '#a8bd5e',
    well: '#c6cfa2', gridLine: 'rgba(55,65,40,.10)',
    overlay: 'rgba(47,49,40,.93)', overlaySoft: 'rgba(47,49,40,.55)',
    boardShadow: '0 0 0 3px #6b7052, 0 0 0 6px #2b2d25',
    flash: '240,246,210',
    scanlines: true, // reads as the LCD pixel grid rather than a CRT
    block: { style: 'inset', glow: 0, light: 0.42, shade: 0.32, outline: 'rgba(45,52,33,.9)' },
    pieces: { I:'#2f3a22', J:'#3f4d2e', L:'#4f603a', O:'#5f7346', S:'#6f8652', T:'#7f995e', Z:'#8fac6a' },
  },

};

const STORE = 'blockfall.theme';
// Read by the inline script in index.html, which has to run before first paint.
const PAINT_STORE = 'blockfall.paint';

// Mutated in place: importers hold this binding, so a switch has to change its
// contents rather than swap the object.
export const theme = {};

// Also drives the menu's CSS-only drifting debris, so it follows the palette
// without the markup being regenerated.
function pushPieceVars() {
  const root = document.documentElement.style;
  for (const p of Object.keys(theme.pieces)) {
    root.setProperty('--piece-' + p.toLowerCase(), theme.pieces[p]);
  }
}

/** @returns {boolean} whether a colour changed — the caller drops the sprite
 *  cache on true, which is not cheap. */
export function applyLevelPalette(level) {
  const palettes = theme.levelPalettes;
  if (!palettes || !theme.paletteSlots) return false;

  const colors = palettes[(Math.max(1, level) - 1) % palettes.length];
  let changed = false;

  for (const [piece, slot] of Object.entries(theme.paletteSlots)) {
    if (theme.pieces[piece] === colors[slot]) continue;
    theme.pieces[piece] = colors[slot];
    changed = true;
  }

  if (changed) pushPieceVars();
  return changed;
}

export function savedThemeName() {
  try {
    const name = localStorage.getItem(STORE);
    if (name && THEMES[name]) return name;
  } catch {}
  return 'neon';
}

/**
 * An `rgba(...)` with its alpha dropped, as `#rrggbb`.
 *
 * Which is the colour to paint the page under a translucent overlay. The page
 * renders `aO + (1-a)X` for a page colour X, and the strip the browser fills
 * outside the page *is* X — so they are equal only where `X = aO + (1-a)X`,
 * which solves to `X = O`. Compositing the overlay over the theme instead, as
 * this did, lands a few levels off every time and leaves the seam in miniature.
 */
function opaque(over) {
  const inner = /rgba?\(([^)]+)\)/.exec(over);
  if (!inner) return over;
  // Split rather than pattern-matched per channel: a separator of \D+ ate the
  // decimal point of ".9" and read the alpha as 9.
  const parts = inner[1].split(',').map(parseFloat);
  if (parts.slice(0, 3).some(Number.isNaN)) return over;
  return '#' + parts.slice(0, 3)
    .map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

let chromeMode = 'base';

/**
 * What the browser paints its *own* chrome with — the iOS status bar, the strip
 * behind Safari's toolbar, the Android bar.
 *
 * It has to be what is actually on screen, and under a full overlay that is the
 * overlay composited over the theme rather than the theme itself. On NES those
 * are #030303 against #1c1c1c, which showed as a lighter band at both ends of
 * the page, mistakable for the app cutting its own background short.
 *
 * @param {'base'|'overlay'|'soft'} [mode]  omit to repaint the current one.
 */
/** What the screen reads as, flattened. @param {'base'|'overlay'|'soft'} mode */
export function chromeColor(mode = chromeMode) {
  if (mode === 'base') return theme.bg;
  return opaque(mode === 'soft' ? theme.overlaySoft : theme.overlay);
}

export function setChrome(mode = chromeMode) {
  chromeMode = mode;
  const color = chromeColor(mode);

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);

  // And the document's own background. Installed, iOS fills the strip outside
  // the page — behind the home indicator — from this rather than from anything
  // drawn inside it, so the overlay never reached it and it stayed the theme's
  // raw colour. theme-color alone fixed the top and left that band at the foot.
  // html's background is what propagates to the canvas outside the page.
  if (document.documentElement?.style) document.documentElement.style.background = color;
  if (document.body?.style) document.body.style.background = color;

  // Remembered for the next launch. Installed, the viewport is shorter than the
  // screen — 812 against 874 — and iOS fills the rest from the page background
  // as it stood at first paint. Repainting from here happens after that, so the
  // band kept the stylesheet's colour and never matched the menu above it.
  try { localStorage.setItem(PAINT_STORE, color); } catch {}
}

export function setTheme(name) {
  if (!THEMES[name]) name = 'neon';

  // Cleared first: Object.assign leaves keys the incoming theme doesn't define,
  // which let NES's levelPalettes survive into Neon and repaint it on level-up.
  for (const key of Object.keys(theme)) delete theme[key];
  Object.assign(theme, THEMES[name]);
  theme.key = name;
  // Assign copies `pieces` by reference; level palettes rewrite it, which would
  // permanently edit the THEMES entry.
  theme.pieces = { ...THEMES[name].pieces };

  const root = document.documentElement.style;
  root.setProperty('--bg', theme.bg);
  root.setProperty('--panel', theme.panel);
  root.setProperty('--edge', theme.edge);
  root.setProperty('--text', theme.text);
  root.setProperty('--dim', theme.dim);
  root.setProperty('--accent', theme.accent);
  root.setProperty('--overlay', theme.overlay);
  root.setProperty('--overlay-soft', theme.overlaySoft);
  root.setProperty('--board-shadow', theme.boardShadow);
  root.setProperty('--scanlines', theme.scanlines ? 'block' : 'none');

  pushPieceVars();

  setChrome();

  try { localStorage.setItem(STORE, name); } catch {}
}

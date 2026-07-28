// A theme owns every color decision, including how blocks are lit. Light-
// background themes need the glow near zero and a softer shade, otherwise the
// bevel reads as grime rather than depth.
export const THEMES = {
  neon: {
    name: 'Neon',
    bg: '#07060f', panel: '#0f0d1f', edge: '#241f42',
    text: '#e8e6ff', dim: '#7b74a8', accent: '#ff2d95',
    well: '#0a0819', gridLine: 'rgba(120,100,220,.09)',
    overlay: 'rgba(7,6,15,.9)',
    boardShadow: '0 0 0 1px var(--edge), 0 0 46px -8px var(--accent)',
    flash: '255,255,255',
    scanlines: true,
    block: { glow: 1, light: 0.5, shade: 0.42, outline: 'rgba(255,255,255,.28)' },
    pieces: { I:'#22e8ff', J:'#4d6bff', L:'#ff9d24', O:'#ffe14d', S:'#3dff96', T:'#c14dff', Z:'#ff2f68' },
  },

  aurora: {
    name: 'Aurora',
    bg: '#04101a', panel: '#0a1c2b', edge: '#17384a',
    text: '#dff4ff', dim: '#6d94a8', accent: '#4fe3c1',
    well: '#061520', gridLine: 'rgba(80,180,200,.09)',
    overlay: 'rgba(4,16,26,.9)',
    boardShadow: '0 0 0 1px var(--edge), 0 0 52px -10px var(--accent)',
    flash: '224,255,248',
    scanlines: false,
    block: { glow: 0.85, light: 0.46, shade: 0.4, outline: 'rgba(255,255,255,.24)' },
    pieces: { I:'#5ce1e6', J:'#4a7fd4', L:'#ffb26b', O:'#ffe9a3', S:'#7ef0a8', T:'#a98cf0', Z:'#f0788f' },
  },

  forest: {
    name: 'Forest',
    bg: '#14180f', panel: '#1e2417', edge: '#3a4327',
    text: '#eef0e2', dim: '#8d9678', accent: '#d98a3d',
    well: '#191e12', gridLine: 'rgba(150,170,110,.09)',
    overlay: 'rgba(20,24,15,.92)',
    boardShadow: '0 0 0 1px var(--edge), 0 4px 30px -12px rgba(217,138,61,.8)',
    flash: '248,242,214',
    scanlines: false,
    block: { glow: 0.3, light: 0.4, shade: 0.38, outline: 'rgba(255,255,255,.18)' },
    pieces: { I:'#63c2c9', J:'#4e6fa8', L:'#d98a3d', O:'#e8c65c', S:'#7fae4b', T:'#a2739f', Z:'#c1583f' },
  },

  sakura: {
    name: 'Sakura',
    bg: '#fdf4f6', panel: '#fbe9ee', edge: '#f0cdd7',
    text: '#5b4650', dim: '#a98b96', accent: '#e88aa8',
    well: '#fceef2', gridLine: 'rgba(180,130,150,.16)',
    overlay: 'rgba(253,244,246,.92)',
    boardShadow: '0 0 0 1px var(--edge), 0 6px 26px -12px rgba(150,90,110,.55)',
    flash: '255,255,255',
    scanlines: false,
    block: { glow: 0.1, light: 0.55, shade: 0.2, outline: 'rgba(90,60,75,.22)' },
    pieces: { I:'#7fc4d6', J:'#8fa3d9', L:'#f2a35e', O:'#f3d06b', S:'#8fcf9a', T:'#c79ade', Z:'#ef8397' },
  },
};

const STORE = 'blockfall.theme';

// Mutated in place rather than reassigned: importers hold this binding, so a
// theme switch has to change its contents, not swap the object.
export const theme = {};

export function savedThemeName() {
  try {
    const name = localStorage.getItem(STORE);
    if (name && THEMES[name]) return name;
  } catch {}
  return 'neon';
}

export function setTheme(name) {
  if (!THEMES[name]) name = 'neon';
  Object.assign(theme, THEMES[name]);
  theme.key = name;

  const root = document.documentElement.style;
  root.setProperty('--bg', theme.bg);
  root.setProperty('--panel', theme.panel);
  root.setProperty('--edge', theme.edge);
  root.setProperty('--text', theme.text);
  root.setProperty('--dim', theme.dim);
  root.setProperty('--accent', theme.accent);
  root.setProperty('--overlay', theme.overlay);
  root.setProperty('--board-shadow', theme.boardShadow);
  root.setProperty('--scanlines', theme.scanlines ? 'block' : 'none');

  // Colors the Android status bar to match the board.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);

  try { localStorage.setItem(STORE, name); } catch {}
}

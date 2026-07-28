export const THEMES = {
  neon: {
    name: 'Neon',
    bg: '#07060f', panel: '#0f0d1f', edge: '#241f42',
    text: '#e8e6ff', dim: '#7b74a8', accent: '#ff2d95',
    well: '#0a0819', gridLine: 'rgba(120,100,220,.09)',
    scanlines: true,
    pieces: { I:'#22e8ff', J:'#4d6bff', L:'#ff9d24', O:'#ffe14d', S:'#3dff96', T:'#c14dff', Z:'#ff2f68' },
  },
};

// Mutated in place rather than reassigned: importers hold this binding, so a
// theme switch has to change its contents, not swap the object.
export const theme = {};

export function setTheme(name) {
  Object.assign(theme, THEMES[name]);
  const root = document.documentElement.style;
  root.setProperty('--bg', theme.bg);
  root.setProperty('--panel', theme.panel);
  root.setProperty('--edge', theme.edge);
  root.setProperty('--text', theme.text);
  root.setProperty('--dim', theme.dim);
  root.setProperty('--accent', theme.accent);
  root.setProperty('--scanlines', theme.scanlines ? 'block' : 'none');
}

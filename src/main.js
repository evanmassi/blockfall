import { G, loadStats } from './state.js';
import { setTheme, savedThemeName } from './themes.js';
import { resize, render } from './render.js';
import { update, showMenu, togglePause } from './game.js';
import { updateKeyRepeat } from './input.js';
import { Sound } from './audio.js';
import { muteBtn } from './dom.js';

document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing') togglePause();
});
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

let lastFrame = 0;

function frame(t) {
  const dt = Math.min(t - lastFrame, 100);
  lastFrame = t;

  if (G.state === 'playing' && G.active) updateKeyRepeat(dt);
  update(dt);
  render();

  requestAnimationFrame(frame);
}

G.stats = loadStats();
muteBtn.textContent = Sound.muted ? '♪̸' : '♪';
setTheme(savedThemeName()); // resize() does the sprite/well rebuild that follows
resize();
showMenu();
requestAnimationFrame(t => { lastFrame = t; frame(t); });

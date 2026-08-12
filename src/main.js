// Boot order, the frame loop, and the window-level listeners that belong to no
// single subsystem.

import { G, loadStats, migrateLegacyRun } from './state.js';
import { setTheme, savedThemeName } from './themes.js';
import { resize, render, tickQueue } from './render.js';
import { tickScore } from './ui.js';
import { update, showMenu, togglePause, snapshotRun } from './game.js';
import { updateKeyRepeat } from './input.js';
import { Sound } from './audio.js';
import { muteBtn } from './dom.js';

// Resolved against this module so it still lands on /sw.js when served from a
// subpath like /blockfall/. Needs HTTPS or localhost.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  });
}

// Bumped by hand when testing on a device, so a stale cache is visible rather
// than looking like a bug. Shown in the ?debug readout.
const BUILD = 'b13';

// ?debug — the real event sequence for a tap. Capture phase, so it sees every
// event regardless of what any handler does with it.
if (new URLSearchParams(location.search).has('debug')) {
  const out = document.createElement('div');
  out.id = 'debug';
  document.body.appendChild(out);

  const lines = [`build ${BUILD}`];
  // Also posted to the dev server, so a phone's log lands in debug.log instead
  // of being read off a tiny green bar and retyped.
  const log = line => {
    lines.push(line);
    if (lines.length > 8) lines.splice(1, 1);
    out.textContent = lines.join('\n');
    // An image GET, not fetch/sendBeacon: nothing can quietly drop it.
    try { new Image().src = '/log?m=' + encodeURIComponent(line) + '&t=' + lines.length; } catch {}
  };
  globalThis.__bfLog = log;
  log(`--- session start, build ${BUILD} ---`);
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    document.addEventListener(type, e => {
      const t = e.target;
      const cls = typeof t.className === 'string' && t.className
        ? '.' + t.className.trim().split(/\s+/).join('.') : '';
      const act = t.closest?.('[data-act]')?.dataset.act ?? '-';
      log(`${type}/${e.pointerType || 'x'} ${t.tagName}${cls} act=${act} → ${G.state}`);
    }, true);
  }
}

document.addEventListener('contextmenu', e => e.preventDefault());

// pagehide is the one that fires on iOS when an app is swiped away; unload is
// not reliable there.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (G.state === 'playing') togglePause(); // also snapshots
  else snapshotRun();
});
window.addEventListener('pagehide', snapshotRun);
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

let lastFrame = 0;

function frame(t) {
  // Clamped so a backgrounded tab doesn't return with a delta big enough to
  // drop a piece through the stack in one step.
  const dt = Math.min(t - lastFrame, 100);
  lastFrame = t;

  // Order matters: held keys move the piece, then gravity and lock delay act on
  // where it ended up, then it is drawn once.
  if (G.state === 'playing' && G.active && !G.ready) updateKeyRepeat(dt);
  update(dt);
  render();

  // Presentation only, so both are safe every frame regardless of state.
  tickScore();
  tickQueue(dt);

  requestAnimationFrame(frame);
}

migrateLegacyRun();
G.stats = loadStats();
muteBtn.textContent = Sound.muted ? '♪̸' : '♪';
setTheme(savedThemeName()); // resize() does the sprite/well rebuild that follows
resize();
showMenu();
requestAnimationFrame(t => { lastFrame = t; frame(t); });

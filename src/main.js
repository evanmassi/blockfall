// Boot order, the frame loop, and the window-level listeners that belong to no
// single subsystem.

import { G, loadStats, loadSettings, migrateLegacyRun } from './state.js';
import { setTheme, savedThemeName } from './themes.js';
import { resize, render, tickQueue } from './render.js';
import { tickScore, syncScreenHeight } from './ui.js';
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
const BUILD = 'b48';

// An installed app can't be handed a query string — the icon keeps whatever URL
// it was added with — so five taps on the wordmark toggle it from inside. That
// is the only way to read the boxes on the one configuration that matters.
const DEBUG_KEY = 'blockfall.debug';
let marks = 0, markedAt = -Infinity;

document.addEventListener('pointerdown', e => {
  if (!e.target?.closest?.('.markWrap')) return;
  const now = e.timeStamp ?? 0;
  marks = now - markedAt < 3000 ? marks + 1 : 1;
  markedAt = now;
  if (marks < 5) return;
  marks = 0;
  try {
    const on = localStorage.getItem(DEBUG_KEY) === '1';
    localStorage.setItem(DEBUG_KEY, on ? '0' : '1');
  } catch {}
  location.reload(); // so the boot-time measurements run under the new setting
}, true);

const debugging = new URLSearchParams(location.search).has('debug') ||
  (() => { try { return localStorage.getItem(DEBUG_KEY) === '1'; } catch { return false; } })();

// The real event sequence for a tap. Capture phase, so it sees every event
// regardless of what any handler does with it.
if (debugging) {
  const out = document.createElement('div');
  out.id = 'debug';
  document.body.appendChild(out);
  document.getElementById('app').classList.add('showBoxes');

  // The measurements are pinned above the event log rather than scrolling with
  // it: on an installed app there is no dev server to post to, so a screenshot
  // of this readout is the only way they leave the device.
  let head = [], tail = [];
  const draw = () => { out.textContent = [`build ${BUILD}`, ...head, ...tail].join('\n'); };
  const post = line => {
    // An image GET, not fetch/sendBeacon: nothing can quietly drop it.
    try { new Image().src = '/log?m=' + encodeURIComponent(line) + '&t=' + Date.now(); } catch {}
  };
  const log = line => {
    tail.push(line);
    if (tail.length > 4) tail.shift();
    draw();
    post(line);
  };
  globalThis.__bfLog = log;
  post(`--- session start, build ${BUILD} ---`);

  // Where each layer actually lands. A seam between them is only visible on the
  // device it happens on, and reading it off a screenshot is guesswork — these
  // are the numbers that say which box is short and by how much.
  const boxes = () => {
    const cs = getComputedStyle(document.getElementById('app'));
    const r = sel => {
      const el = sel[0] === '#' ? document.getElementById(sel.slice(1)) : document.querySelector(sel);
      const b = el?.getBoundingClientRect?.();
      return b ? `${sel} ${Math.round(b.top)}→${Math.round(b.bottom)}` : `${sel} absent`;
    };
    head = [
      `vp ${innerWidth}x${innerHeight} vis ${Math.round(visualViewport?.height ?? 0)} dpr ${devicePixelRatio}`,
      `screen ${screen?.width}x${screen?.height} outer ${outerWidth}x${outerHeight}`,
      `safe t${cs.paddingTop} b${cs.paddingBottom} standalone=${!!navigator.standalone}`,
      `${r('#app')} ${r('#overlay')}`,
      `${r('.bgfall')} ${r('#stage')}`,
      `html=${document.documentElement.style.background || '(css)'} body=${document.body.style.background || '(css)'}`,
    ];
    draw();
    head.forEach(post);
  };

  // After the intro settles, and again whenever the URL bar resizes the viewport.
  setTimeout(boxes, 1600);
  addEventListener('resize', () => setTimeout(boxes, 120));
  visualViewport?.addEventListener('resize', () => setTimeout(boxes, 120));
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    document.addEventListener(type, e => {
      const t = e.target;
      const cls = typeof t.className === 'string' && t.className
        ? '.' + t.className.trim().split(/\s+/).join('.') : '';
      const act = t.closest?.('[data-act]')?.dataset.act ?? '-';
      // Coordinates too: tapping a seam is the only way to say where it is in
      // the page's own terms rather than in screenshot pixels.
      const at = `@${Math.round(e.clientY)}/${innerHeight}`;
      log(`${type}/${e.pointerType || 'x'} ${at} ${t.tagName}${cls} act=${act} → ${G.state}`);
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
window.addEventListener('resize', () => { syncScreenHeight(); resize(); });
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
G.settings = loadSettings(); // before showMenu, which reads them to size the undo button
muteBtn.textContent = Sound.muted ? '♪̸' : '♪';
setTheme(savedThemeName()); // resize() does the sprite/well rebuild that follows
syncScreenHeight();          // before the menu, which sizes its backdrop from it
resize();
showMenu();
requestAnimationFrame(t => { lastFrame = t; frame(t); });
